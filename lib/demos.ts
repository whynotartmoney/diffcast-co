import { countLineChanges } from "@/lib/reel";
import { languageFromFilename, parsePatch } from "@/lib/parse-patch";
import type { DiffFile, DiffReel, FileStatus } from "@/lib/types";

export interface Demo {
  id: string;
  blurb: string;
  reel: DiffReel;
}

/**
 * Curated highlights of public releases — short enough to play as a reel.
 * They are not the full diffs. The point is that the product works offline.
 */
const REACT_INDEX = `
@@ -12,6 +12,12 @@
 export {
   Children,
   Component,
   useState,
+  useEffect,
+  useContext,
+  useReducer,
+  useCallback,
+  useMemo,
+  useRef,
   createElement,
 };
`;

const REACT_HOOKS = `
@@ -0,0 +1,19 @@
+import ReactCurrentDispatcher from './ReactCurrentDispatcher';
+
+function resolveDispatcher() {
+  const dispatcher = ReactCurrentDispatcher.current;
+  if (dispatcher === null) {
+    throw new Error('Invalid hook call.');
+  }
+  return dispatcher;
+}
+
+export function useState(initialState) {
+  const dispatcher = resolveDispatcher();
+  return dispatcher.useState(initialState);
+}
+
+export function useEffect(create, deps) {
+  const dispatcher = resolveDispatcher();
+  return dispatcher.useEffect(create, deps);
+}
`;

const NEXT_CONFIG = `
@@ -1,5 +1,8 @@
 /** @type {import('next').NextConfig} */
 const nextConfig = {
   reactStrictMode: true,
+  experimental: {
+    appDir: true,
+  },
 };
`;

const NEXT_LAYOUT = `
@@ -0,0 +1,22 @@
+export default function RootLayout({
+  children,
+}: {
+  children: React.ReactNode;
+}) {
+  return (
+    <html lang="en">
+      <body>{children}</body>
+    </html>
+  );
+}
+
+export const metadata = {
+  title: 'Next.js',
+  description: 'The React Framework',
+};
`;

const NEXT_PAGE = `
@@ -0,0 +1,5 @@
+export default function Page() {
+  return <h1>Hello, Next.js 13</h1>;
+}
`;

const SVELTE_PAGE = `
@@ -1,14 +1,16 @@
 <script>
-  let count = 0;
+  let count = $state(0);
 
-  $: doubled = count * 2;
+  let doubled = $derived(count * 2);
 
   function increment() {
     count += 1;
   }
 </script>
 
 <button on:click={increment}>
   clicks: {count}
 </button>
+
+<p>{doubled}</p>
`;

const SVELTE_COUNTER = `
@@ -0,0 +1,14 @@
+export function createCounter() {
+  let value = $state(0);
+
+  return {
+    get value() {
+      return value;
+    },
+    increment() {
+      value += 1;
+    },
+  };
+}
`;

function file(filename: string, status: FileStatus, patch: string): DiffFile {
  const hunks = parsePatch(patch);
  const counts = countLineChanges(hunks);
  return {
    filename,
    status,
    additions: counts.additions,
    deletions: counts.deletions,
    language: languageFromFilename(filename),
    hunks,
  };
}

function reel(partial: Omit<DiffReel, "files"> & { files: DiffFile[] }): DiffReel {
  return partial;
}

export const DEMOS: Demo[] = [
  {
    id: "react-hooks",
    blurb: "The public hook surface, cut down to a title sequence.",
    reel: reel({
      id: "react-hooks",
      title: "React 16.8",
      kicker: "CURATED HIGHLIGHT",
      repo: "facebook/react",
      base: "v16.7.0",
      head: "v16.8.0",
      message: "React 16.8: The One With Hooks",
      author: "gaearon",
      date: "2019-02-06",
      source: "demo",
      sourceUrl: "https://github.com/facebook/react/releases/tag/v16.8.0",
      files: [
        file("packages/react/index.js", "modified", REACT_INDEX),
        file("packages/react/src/ReactHooks.js", "added", REACT_HOOKS),
      ],
    }),
  },
  {
    id: "next-app-router",
    blurb: "The moment next.config grew an app directory.",
    reel: reel({
      id: "next-app-router",
      title: "Next.js 13",
      kicker: "CURATED HIGHLIGHT",
      repo: "vercel/next.js",
      base: "v12.3.1",
      head: "v13.0.0",
      message: "Next.js 13",
      author: "timneutkens",
      date: "2022-10-25",
      source: "demo",
      sourceUrl: "https://github.com/vercel/next.js/releases/tag/v13.0.0",
      files: [
        file("next.config.js", "modified", NEXT_CONFIG),
        file("app/layout.tsx", "added", NEXT_LAYOUT),
        file("app/page.tsx", "added", NEXT_PAGE),
      ],
    }),
  },
  {
    id: "svelte-runes",
    blurb: "A component crossing from stores and labels into runes.",
    reel: reel({
      id: "svelte-runes",
      title: "Svelte 5",
      kicker: "CURATED HIGHLIGHT",
      repo: "sveltejs/svelte",
      base: "svelte@4.2.19",
      head: "svelte@5.0.0",
      message: "Svelte 5",
      author: "Rich-Harris",
      date: "2024-10-19",
      source: "demo",
      sourceUrl: "https://github.com/sveltejs/svelte/releases/tag/svelte%405.0.0",
      files: [
        file("src/routes/+page.svelte", "modified", SVELTE_PAGE),
        file("src/lib/counter.svelte.js", "added", SVELTE_COUNTER),
      ],
    }),
  },
];

export function demoById(id: string): Demo | null {
  return DEMOS.find((demo) => demo.id === id) ?? null;
}
