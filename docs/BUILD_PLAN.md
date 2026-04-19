# Woot Town Runner Build Plan

## Phase 1: Core Runner Polish

- tighten run/jump feel and re-check sprite offsets against the stage footage
- tune `loopEnd` points so stage handoffs stay invisible
- add restart and reset behavior that does not require returning to mode select
- decide whether score should reflect distance, time, collectibles, or a hybrid

Acceptance target:

- the current loop feels stable on desktop and touch devices for a full play session

## Phase 2: Game Systems

- add at least one obstacle or pickup system
- define win/lose or loop escalation rules
- add lightweight FX such as speed boosts, hit reactions, or combo feedback
- introduce audio hooks once the gameplay pacing is set

Acceptance target:

- the prototype has a readable toy-like objective instead of only movement and scoring

## Phase 3: Production Readiness

- document the asset ingest/update workflow
- replace temporary numbers with named tuning groups where it improves balancing
- add browser verification coverage with `playwright`
- package a shareable preview build and short demo notes

Acceptance target:

- future iterations can be done quickly without re-learning the project structure
