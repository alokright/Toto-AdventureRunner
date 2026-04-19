# Woot Town Runner Architecture

## Canonical Runtime

`woot-town-runner` now has one supported runtime surface:

- `src/App.tsx`: mode selection, HUD, input wiring, and render-loop orchestration
- `src/game/config.ts`: gameplay constants, asset paths, stage timings, and player layout
- `src/game/player.ts`: sprite-sheet animation state machine, jump physics, and drawing
- `src/index.css`: visual system and responsive layout

The archived AI Studio export lives under `archive/legacy/ai-studio/` only as reference material. Do not treat it as a second runtime.

## Render Flow

1. `App.tsx` boots through a loading phase, preloads the splash art, sprite sheets, and stage videos, then launches straight into the default two-player mode.
2. Hidden video elements are mounted from `STAGES` in `src/game/config.ts`.
3. A `requestAnimationFrame` loop updates player physics and score, then chooses the active stage video.
4. The active frame is drawn to the visible canvas, and the most recent frame is copied into an off-screen frozen canvas.
5. When nobody is running, the frozen frame stays on screen so the town does not blink back to black.

## Stage Machine

The current sequence is:

- `Stage 1 -> Stage 2 -> Stage 3 -> Stage 2 -> ...`

Each stage has an explicit `loopEnd` timestamp so we can switch videos just before decode gaps show up at the end of the clip. If stage timing changes, update `STAGES` in `src/game/config.ts` first.

## Asset Layout

- `public/loading/`: splash artwork used during the boot/loading phase
- `public/video/`: clips that the runtime needs to stream directly
- `public/sprites/`: sprite sheets used by the canvas renderer
- `assets/source/`: source footage or media that should not ship as public runtime assets
- `archive/legacy/ai-studio/`: prior workflow exports kept for comparison or logic recovery

Rule of thumb: if the browser must fetch it during play, it belongs in `public/`; otherwise it should live in `assets/` or `archive/`.

## Working Conventions

- Keep app-shell changes in `src/App.tsx`; keep gameplay internals in `src/game/`.
- Prefer named CSS classes and shared CSS variables in `src/index.css` over utility-class sprawl.
- Avoid alternate root-level HTML entry points. If you need a throwaway experiment, place it under `scratch/` and fold it back into `src/`.
- After meaningful changes, run `npm run typecheck` and `npm run build`.

## Current Gaps

- no obstacles, pickups, fail state, or restart flow yet
- no audio integration
- no asset pipeline docs beyond the basic folder rules above
- no automated browser verification yet
