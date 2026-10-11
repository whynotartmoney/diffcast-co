# Contributing to Diffcast

Diffcast is a small Next.js app: a canvas reel, a few canned diffs, an optional public GitHub fetch, and a client-side GIF. Changes should keep the demo working with the network off, and `npm run build` should pass.

## Develop

```bash
npm install
npm run dev
```

The dev server listens on port **43219**.

Before opening a pull request:

```bash
npx tsx scripts/self-check.ts
npm run lint
npm run build
```

`scripts/self-check.ts` covers URL parsing, the unified-diff walker, beat timing (the GIF cut is 8 seconds), and share-link round trips. It does not render pixels.

## What we will take

- A tighter scene, a clearer empty or error state, a language in the presentation highlighter.
- Bug fixes in the GitHub URL parser or the patch walker. Please add a case to `scripts/self-check.ts`.
- Another short canned reel in `lib/demos.ts`, attributed to a real public project and labeled as a highlight.

## What is out of scope for now

Private repositories, audio, vertical TikTok templates, and anything that needs a secret to run the demo. Do not add an API token requirement. If a change needs configuration, it has to have a fallback that still plays the canned reels.

## Good first issues

These are sized so a first change can land without learning the whole player.

1. **Highlighter coverage** — `lib/highlight.ts` tokenizes a line for the reel. It is deliberately not Shiki. Adding a language means extending the keyword set and, if needed, the comment rule. Check it against a canned or pasted snippet, not a test suite of the whole grammar.

2. **Portrait 9:16 stage** — `renderReel` draws in a fixed 1280×720 space so the GIF matches the screen. A second layout can branch on an aspect ratio without rewriting `lib/timeline.ts`. Keep the GIF at or under 720p and 8 seconds.

3. **WebM export** — `lib/export-gif.ts` already steps the shared renderer frame by frame. A WebM path can reuse that loop. GIF should stay the default; it is what people drop into a README.

4. **Shortcut overlay** — Space and the arrow keys are handled in `components/studio.tsx`. A `?` panel that lists them is unused surface area. It should not trap focus inside a textarea.

5. **One more canned reel** — Follow the shape in `lib/demos.ts`: a real repository, a short patch, a kicker of `CURATED HIGHLIGHT`, and a link to the public release. Run the self-check. The play timeline must stay within 4–6 beats, and the GIF timeline must stay 8000ms.

## Notes for reviewers

- Scenes are a function of time. If a scrub lands mid-hunk, the frame must match a playing reel at that timestamp. Don’t animate with CSS timelines that the GIF cannot see.
- The GIF quantizes once and reuses the palette. Per-frame palettes flicker on the type.
- Comments belong on the non-obvious parts (the shared palette, the fixed stage size, the GitHub trim). The rest of the code should read without them.

## License

By contributing, you agree that your work is licensed under the [MIT License](LICENSE).
