import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

import { demoById } from "@/lib/demos";

export type ShareState =
  | { kind: "demo"; id: string }
  | { kind: "github"; url: string }
  | { kind: "paste"; before: string; after: string; filename: string; title: string };

const MAX_HASH = 12000;
const MAX_PASTE = 20000;

export function encodeShare(state: ShareState): { path: string; overflow: boolean } {
  if (state.kind === "demo") {
    return { path: `/?demo=${encodeURIComponent(state.id)}`, overflow: false };
  }
  if (state.kind === "github") {
    return { path: `/?compare=${encodeURIComponent(state.url)}`, overflow: false };
  }

  const packed = compressToEncodedURIComponent(
    JSON.stringify({
      b: state.before.slice(0, MAX_PASTE),
      a: state.after.slice(0, MAX_PASTE),
      f: state.filename,
      t: state.title,
    }),
  );

  if (packed.length > MAX_HASH) {
    return { path: "/", overflow: true };
  }
  return { path: `/#p=${packed}`, overflow: false };
}

export function decodeShare(search: string, hash: string): ShareState | "invalid" | null {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (body.startsWith("p=")) {
    const json = decompressFromEncodedURIComponent(body.slice(2));
    if (!json) return "invalid";
    try {
      const data = JSON.parse(json) as { b?: unknown; a?: unknown; f?: unknown; t?: unknown };
      if (typeof data.b !== "string" || typeof data.a !== "string") return "invalid";
      return {
        kind: "paste",
        before: data.b.slice(0, MAX_PASTE),
        after: data.a.slice(0, MAX_PASTE),
        filename: typeof data.f === "string" && data.f.trim() ? data.f.slice(0, 120) : "snippet.ts",
        title: typeof data.t === "string" && data.t.trim() ? data.t.slice(0, 140) : "Untitled reel",
      };
    } catch {
      return "invalid";
    }
  }

  const params = new URLSearchParams(search);
  const compare = params.get("compare");
  if (compare) return { kind: "github", url: compare };
  const demo = params.get("demo");
  if (demo) {
    if (!demoById(demo)) return "invalid";
    return { kind: "demo", id: demo };
  }
  return null;
}

export function replaceShareUrl(path: string) {
  const next = `${window.location.origin}${path}`;
  window.history.replaceState(null, "", next);
}
