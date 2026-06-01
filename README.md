# Pixelate Studio

Load an image, pixelate it over a grid of a chosen resolution, edit it cell-by-cell, and
**export a PNG with a transparent background**. A polished, fully client-side alternative to
[pixelated.vercel.app](https://pixelated.vercel.app) with an animated
[React Bits](https://reactbits.dev)–style particle background.

![grid · transparent · client-side](https://img.shields.io/badge/100%25-client--side-7c5cff)

## Features

- 🖼️ **Load images** — drag & drop, file picker, or paste from the clipboard
- 🔳 **Grid pixelation** — pick the output resolution (8–256 px wide); aspect ratio is preserved
- 🎨 **Colour quantization** — optional retro palette reduction (2–32 levels per channel)
- ✂️ **Editing tools**
  - **Erase / Restore** brush (adjustable size) to paint cells transparent and back
  - **Magic erase** — flood-fill contiguous similar cells (tolerance slider)
  - **Drop colour** — remove every cell of a similar colour in one click
- 🏁 **Grid overlay** for precise editing
- ⬇️ **Transparent PNG export** at 1×–16× (crisp nearest-neighbour upscaling)
- ✨ Animated particle background, glassmorphism UI, fully responsive
- 🔒 Everything runs in the browser — images never leave the device

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
```

## Deploy to Vercel

This is a static Vite app — Vercel detects it automatically.

```bash
npm i -g vercel
vercel            # preview deploy
vercel --prod     # production deploy
```

Or push to GitHub and "Import Project" on [vercel.com](https://vercel.com) — the included
`vercel.json` sets the framework, build command (`npm run build`) and output dir (`dist`).

## Stack

React 18 · TypeScript · Vite · HTML5 Canvas · zero runtime UI dependencies.
