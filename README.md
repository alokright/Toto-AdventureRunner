# Woot Town Runner

Browser-based runner prototype for `Woot Town`.

The game combines staged video backgrounds with sprite-sheet characters so the world feels like a living toy-town diorama while still staying lightweight enough to tune in the browser.

## Why This Project Exists

This prototype is meant to answer a few fast product questions:

- does the runner feel playful with simple tap-and-hold controls
- do the stitched video loops create enough momentum without building a full level engine
- can the same surface support a clear solo mode and a toy-friendly couch co-op mode

## Current Status

The project now has one canonical runtime surface:

- React + Vite app in `src/`
- staged video loop switching across three background clips
- `Mama` and `Baby` sprite sheets with `idle`, `startRun`, and `jump` states
- on-screen and keyboard controls for one-player and two-player modes
- archived AI Studio export kept only as reference material
- repo-local Codex skill and docs scaffold for future iterations

## Project Structure

- `docs/ARCHITECTURE.md`: runtime layout, stage machine, asset rules, and working conventions
- `docs/BUILD_PLAN.md`: next implementation phases and acceptance targets
- `src/App.tsx`: app shell, HUD, mode selection, input wiring, and render loop coordination
- `src/game/config.ts`: stage timings, player layouts, asset paths, and gameplay constants
- `src/game/player.ts`: player physics, sprite animation state machine, and drawing
- `src/index.css`: visual system and responsive UI styling
- `public/video/`: runtime stage loops served by Vite
- `public/sprites/`: runtime sprite sheets served by Vite
- `assets/source/`: non-runtime source media kept for future editing/reference
- `archive/legacy/ai-studio/`: original export artifacts from the alternate workflow
- `.codex/skills/woot-town-runner-builder/`: project-specific Codex skill for future sessions

## Skills

- Use `$woot-town-runner-builder` when working on gameplay, stage timing, sprite integration, cleanup, or docs inside this project.
- Use `playwright` after the app is running and browser verification or screenshots matter.
- Use `imagegen` if new bitmap assets or UI mockups are needed.

## Run Locally

From `/Users/alokkumar/Documents/Playground/woot-town-runner`:

```bash
npm install
npm run dev
```

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

For verification:

```bash
npm run typecheck
npm run build
```

## Notes

- Keep only shipped runtime assets in `public/`.
- If you need a throwaway experiment, place it under `scratch/` and fold it back into `src/` quickly instead of adding duplicate root or `public/` HTML entry points.
