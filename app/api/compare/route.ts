import { Octokit } from "@octokit/rest";
import { NextRequest, NextResponse } from "next/server";

import { languageFromFilename, mapStatus, parsePatch, windowHunks } from "@/lib/parse-patch";
import { canonicalGitHubUrl, parseGitHubTarget, type GitTarget } from "@/lib/parse-url";
import { oneLine } from "@/lib/format";
import type { DiffFile, DiffReel } from "@/lib/types";

export const runtime = "nodejs";

const octokit = new Octokit({
  userAgent: "diffcast/0.1.0",
});

const MAX_FILES = 8;

type GitHubFile = {
  filename: string;
  previous_filename?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string;
};

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url") ?? "";
  const target = parseGitHubTarget(raw);
  if (!target) {
    return NextResponse.json(
      {
        error:
          "Use a public GitHub compare, commit, or pull URL. Private repositories are out of scope — paste the diff instead.",
      },
      { status: 400 },
    );
  }

  try {
    const reel = await loadReel(target, raw.trim());
    return NextResponse.json(reel, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    const status = statusOf(error);
    return NextResponse.json({ error: messageFor(status) }, { status: status === 404 ? 404 : status });
  }
}

async function loadReel(target: GitTarget, raw: string): Promise<DiffReel> {
  if (target.kind === "pull") {
    const pull = await octokit.rest.pulls.get({
      owner: target.owner,
      repo: target.repo,
      pull_number: target.number,
    });
    const compare = await octokit.rest.repos.compareCommitsWithBasehead({
      owner: target.owner,
      repo: target.repo,
      basehead: `${pull.data.base.sha}...${pull.data.head.sha}`,
    });
    return reelFromCompare({
      owner: target.owner,
      repo: target.repo,
      base: pull.data.base.ref,
      head: pull.data.head.ref,
      message: oneLine(pull.data.title, `Pull request #${target.number}`),
      author: pull.data.user?.login ?? target.owner,
      date: (pull.data.updated_at || pull.data.created_at || "").slice(0, 10),
      sourceUrl: pull.data.html_url || canonicalGitHubUrl(target),
      files: compare.data.files ?? [],
      id: `pr-${target.owner}-${target.repo}-${target.number}`,
    });
  }

  if (target.kind === "commit") {
    const commit = await octokit.rest.repos.getCommit({
      owner: target.owner,
      repo: target.repo,
      ref: target.sha,
    });
    const parent = commit.data.parents?.[0]?.sha?.slice(0, 7) ?? "parent";
    return reelFromCompare({
      owner: target.owner,
      repo: target.repo,
      base: parent,
      head: commit.data.sha.slice(0, 7),
      message: oneLine(commit.data.commit.message, "Commit"),
      author: commit.data.author?.login ?? commit.data.commit.author?.name ?? target.owner,
      date: (commit.data.commit.author?.date ?? "").slice(0, 10),
      sourceUrl: commit.data.html_url ?? canonicalGitHubUrl(target),
      files: commit.data.files ?? [],
      id: `commit-${target.owner}-${target.repo}-${target.sha.slice(0, 7)}`,
    });
  }

  const compare = await octokit.rest.repos.compareCommitsWithBasehead({
    owner: target.owner,
    repo: target.repo,
    basehead: `${target.base}...${target.head}`,
  });
  const commits = compare.data.commits ?? [];
  const last = commits[commits.length - 1];
  const subject = last?.commit?.message
    ? oneLine(last.commit.message, "Compare")
    : "Compare";
  const message =
    (compare.data.total_commits ?? commits.length) > 1
      ? `${compare.data.total_commits} commits · ${subject}`
      : subject;

  return reelFromCompare({
    owner: target.owner,
    repo: target.repo,
    base: target.base,
    head: target.head,
    message,
    author: last?.author?.login ?? last?.commit?.author?.name ?? target.owner,
    date: (last?.commit?.author?.date ?? "").slice(0, 10),
    sourceUrl: canonicalGitHubUrl(target) || raw,
    files: compare.data.files ?? [],
    id: `compare-${target.owner}-${target.repo}-${target.base}-${target.head}`,
  });
}

function reelFromCompare(input: {
  owner: string;
  repo: string;
  base: string;
  head: string;
  message: string;
  author: string;
  date: string;
  sourceUrl: string;
  files: GitHubFile[];
  id: string;
}): DiffReel {
  const totals = {
    files: input.files.length,
    additions: input.files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
    deletions: input.files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
  };
  const files = input.files.slice(0, MAX_FILES).map(mapFile);
  const truncated =
    input.files.length > MAX_FILES ||
    input.files.some((file) => (file.patch?.split("\n").length ?? 0) > 180);

  return {
    id: input.id.slice(0, 180),
    title: input.message,
    kicker: "GITHUB",
    repo: `${input.owner}/${input.repo}`,
    base: input.base,
    head: input.head,
    message: input.message,
    author: input.author,
    date: input.date || new Date().toISOString().slice(0, 10),
    source: "github",
    sourceUrl: input.sourceUrl,
    truncated,
    totals,
    files,
  };
}

function mapFile(file: GitHubFile): DiffFile {
  const patch = file.patch ? file.patch.split("\n").slice(0, 180).join("\n") : "";
  const hunks = patch ? windowHunks(parsePatch(patch)) : [];
  return {
    filename: file.filename,
    previousFilename: file.previous_filename,
    status: mapStatus(file.status ?? "modified"),
    additions: file.additions ?? 0,
    deletions: file.deletions ?? 0,
    language: languageFromFilename(file.filename),
    hunks,
  };
}

function statusOf(error: unknown): number {
  if (typeof error === "object" && error && "status" in error) {
    const status = Number((error as { status: number }).status);
    if (status === 404) return 404;
    if (status === 403 || status === 429) return 429;
    if (status === 422) return 422;
  }
  return 502;
}

function messageFor(status: number): string {
  if (status === 404) {
    return "GitHub couldn't find that public repository or ref. Private repos aren't supported — paste the diff instead.";
  }
  if (status === 429) {
    return "GitHub rate-limited this unauthenticated request. The canned reels still play offline, or paste the diff.";
  }
  if (status === 422) {
    return "GitHub rejected that compare. Check that both refs exist on a public repository.";
  }
  return "GitHub didn't answer. Paste the diff, or play a canned reel.";
}
