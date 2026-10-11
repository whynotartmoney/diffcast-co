import assert from "node:assert/strict";

import { DEMOS } from "../lib/demos";
import { parseGitHubTarget } from "../lib/parse-url";
import { parsePatch } from "../lib/parse-patch";
import { reelFromPaste, spotlightLine } from "../lib/reel";
import { decodeShare, encodeShare } from "../lib/share";
import { buildTimeline } from "../lib/timeline";

const compare = parseGitHubTarget(
  "https://github.com/facebook/react/compare/v16.7.0...v16.8.0",
);
assert.equal(compare?.kind, "compare");
if (compare?.kind === "compare") {
  assert.equal(compare.owner, "facebook");
  assert.equal(compare.repo, "react");
  assert.equal(compare.base, "v16.7.0");
  assert.equal(compare.head, "v16.8.0");
}

const twoDot = parseGitHubTarget("github.com/vercel/next.js/compare/v12.3.1..v13.0.0");
assert.equal(twoDot?.kind, "compare");

const slashBranch = parseGitHubTarget(
  "https://github.com/acme/widgets/compare/release/1.2...feature/reel",
);
assert.equal(slashBranch?.kind, "compare");
if (slashBranch?.kind === "compare") {
  assert.equal(slashBranch.base, "release/1.2");
  assert.equal(slashBranch.head, "feature/reel");
}

const commit = parseGitHubTarget("facebook/react/commit/abc1234def");
assert.equal(commit?.kind, "commit");

const pull = parseGitHubTarget("https://github.com/vercel/next.js/pull/42000/files");
assert.equal(pull?.kind, "pull");

assert.equal(parseGitHubTarget("https://gitlab.com/acme/widgets/compare/a...b"), null);
assert.equal(parseGitHubTarget("https://github.com/acme/widgets"), null);

const hunks = parsePatch(`@@ -1,3 +1,3 @@
 line
-old
+new
 tail
`);
assert.equal(hunks.length, 1);
assert.equal(hunks[0].lines.filter((line) => line.type === "add").length, 1);
assert.equal(hunks[0].lines[2].newNo, 2);

for (const demo of DEMOS) {
  const play = buildTimeline(demo.reel, "play");
  const gif = buildTimeline(demo.reel, "gif");
  assert.ok(play.beats.length >= 4 && play.beats.length <= 6, demo.id);
  assert.equal(gif.duration, 8000, demo.id);
  assert.ok(gif.beats.length >= 4 && gif.beats.length <= 6, `${demo.id} gif beats`);
  assert.ok(demo.reel.files.some((file) => file.hunks.length > 0));
}

const spotlight = spotlightLine(DEMOS[0].reel);
assert.ok(spotlight?.includes("useState"), spotlight ?? "missing spotlight");

const pasted = reelFromPaste({
  before: "const n = 1;\n",
  after: "const n = 2;\n",
  filename: "count.ts",
  title: "Bump",
});
assert.ok("reel" in pasted);
if ("reel" in pasted) {
  assert.equal(pasted.reel.files[0].additions, 1);
  assert.equal(pasted.reel.files[0].deletions, 1);
  const encoded = encodeShare({
    kind: "paste",
    before: "const n = 1;\n",
    after: "const n = 2;\n",
    filename: "count.ts",
    title: "Bump",
  });
  const hash = encoded.path.split("#")[1] ?? "";
  const decoded = decodeShare("", `#${hash}`);
  assert.ok(decoded && typeof decoded !== "string" && decoded.kind === "paste");
  if (decoded && typeof decoded !== "string" && decoded.kind === "paste") {
    assert.equal(decoded.title, "Bump");
  }
}

const quiet = reelFromPaste({
  before: "same\n",
  after: "same\n",
  filename: "same.ts",
  title: "Same",
});
assert.ok("reel" in quiet);
if ("reel" in quiet) {
  const gif = buildTimeline(quiet.reel, "gif");
  assert.equal(gif.duration, 8000);
  assert.ok(gif.beats.length >= 4);
}

console.log("self-check ok");
