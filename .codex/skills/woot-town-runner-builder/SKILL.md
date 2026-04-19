---
name: woot-town-runner-builder
description: Use when working on the Woot Town Runner game in /Users/alokkumar/Documents/Playground/woot-town-runner, especially for runner gameplay, stage video timing, sprite-sheet animation, project cleanup, or docs updates.
---

# Woot Town Runner Builder

Work inside `/Users/alokkumar/Documents/Playground/woot-town-runner`.

## Quick Start

- Read `README.md` for the current project shape and run commands.
- Read `docs/ARCHITECTURE.md` before changing runtime structure, asset placement, or stage timing.
- Run `npm run typecheck` and `npm run build` after meaningful code changes.
- Use `playwright` once the dev server is up and browser verification matters.

## Project Rules

- Treat `src/App.tsx` as the app shell and `src/game/` as the gameplay engine.
- Keep only shipped runtime assets in `public/`. Move source footage or reference material into `assets/` or `archive/`.
- Do not add alternate root-level or `public/` HTML entry points. If you need a quick experiment, place it under `scratch/` and fold it back into the canonical app quickly.
- When stage timing or sprite alignment changes, update `src/game/config.ts` first and then reflect any important workflow changes in `docs/ARCHITECTURE.md` or `README.md`.
- Prefer named CSS classes and shared CSS variables in `src/index.css` instead of reintroducing generator-style utility sprawl.

## Common Tasks

- Gameplay tuning: edit `STAGES`, physics constants, or player spawn positions in `src/game/config.ts`.
- Sprite behavior: edit `src/game/player.ts` for animation state changes, fps tuning, or draw offsets.
- UI polish: update `src/App.tsx` and `src/index.css` together so the shell and controls stay consistent.
- Legacy comparison: read `archive/legacy/ai-studio/` only if you need to recover logic from the alternate workflow.

## When To Pull More Context

- Read `docs/BUILD_PLAN.md` when the request is about roadmap, missing systems, or next implementation phases.
- Read the archived AI Studio files only when there is a concrete reason to compare old behavior with the current runtime.
