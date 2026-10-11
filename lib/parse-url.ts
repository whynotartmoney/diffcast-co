export type GitTarget =
  | { kind: "compare"; owner: string; repo: string; base: string; head: string }
  | { kind: "commit"; owner: string; repo: string; sha: string }
  | { kind: "pull"; owner: string; repo: string; number: number };

const NAME = /^[A-Za-z0-9_.-]+$/;

function validRef(ref: string): boolean {
  if (!ref || ref.length > 250) return false;
  if (/\s/.test(ref) || ref.includes("://") || ref.includes("..")) return false;
  if (ref.startsWith("/") || ref.endsWith("/")) return false;
  return /^[A-Za-z0-9._~/@:+-]+$/.test(ref);
}

/**
 * Accepts a GitHub compare, commit, or pull URL, with or without the host.
 * Anything that is not a public github.com path is rejected so the API route
 * cannot be turned into an open proxy.
 */
export function parseGitHubTarget(input: string): GitTarget | null {
  let raw = input.trim();
  if (!raw) return null;
  raw = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  raw = raw.replace(/\.git$/i, "");
  raw = raw.replace(/[#?].*$/, "");
  raw = raw.replace(/\/+$/, "");

  const parts = raw.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  let owner: string;
  let repo: string;
  let rest: string[];

  if (parts[0].includes(".")) {
    if (parts[0].toLowerCase() !== "github.com") return null;
    owner = parts[1] ?? "";
    repo = parts[2] ?? "";
    rest = parts.slice(3);
  } else {
    owner = parts[0];
    repo = parts[1];
    rest = parts.slice(2);
  }

  if (!NAME.test(owner) || !NAME.test(repo)) return null;
  if (rest.length === 0) return null;

  const headKind = rest[0].toLowerCase();

  if (headKind === "compare") {
    const spec = decodeURIComponent(rest.slice(1).join("/"));
    const triple = spec.indexOf("...");
    const splitAt = triple >= 0 ? triple : spec.indexOf("..");
    const width = triple >= 0 ? 3 : 2;
    if (splitAt <= 0) return null;
    const base = spec.slice(0, splitAt);
    const head = spec.slice(splitAt + width);
    if (!validRef(base) || !validRef(head)) return null;
    return { kind: "compare", owner, repo, base, head };
  }

  if (headKind === "commit" && rest[1]) {
    const sha = rest[1];
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) return null;
    return { kind: "commit", owner, repo, sha };
  }

  if ((headKind === "pull" || headKind === "pulls") && rest[1] && /^\d+$/.test(rest[1])) {
    return { kind: "pull", owner, repo, number: Number(rest[1]) };
  }

  return null;
}

export function canonicalGitHubUrl(target: GitTarget): string {
  if (target.kind === "compare") {
    return `https://github.com/${target.owner}/${target.repo}/compare/${target.base}...${target.head}`;
  }
  if (target.kind === "commit") {
    return `https://github.com/${target.owner}/${target.repo}/commit/${target.sha}`;
  }
  return `https://github.com/${target.owner}/${target.repo}/pull/${target.number}`;
}
