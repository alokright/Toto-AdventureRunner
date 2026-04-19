import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CHARACTER_ANIMATIONS,
  CHARACTER_NAMES,
  LOADING_SCREEN_ART_SRC,
  LOOP_IN_POINT,
  MIN_PLAYBACK_RATE,
  MODE_OPTIONS,
  STAGES,
  type GameMode,
  type StageId,
  getStage,
} from './game/config';
import { Player, preloadSpriteSheets } from './game/player';
import {
  CAMERA_PREVIEW_HEIGHT,
  CAMERA_PREVIEW_WIDTH,
  CAMERA_STREAM_CONSTRAINTS,
  createLaneGestureHistories,
  createPoseLandmarker,
  createPoseTrackerState,
  drawDebugCameraPreview,
  getCameraStatusLabel,
  resetLaneGestureHistory,
  resolveTrackedLanes,
  stopMediaStream,
  updateLaneGesture,
  type CameraStatus,
  type ControlMode,
  type LaneAssignment,
} from './game/vision';

type AppPhase = 'loading' | 'playing';

type HudState = {
  scores: [number, number];
  stageId: StageId;
};

type RuntimeState = {
  activeStageId: StageId;
  frozenFrameReady: boolean;
  lastTimestamp: number;
  players: Player[];
};

const INITIAL_HUD: HudState = {
  scores: [0, 0],
  stageId: 1,
};

const BOOT_MODE: GameMode = '2p';
const MIN_LOADING_DURATION_MS = 2200;
const INITIAL_PROGRESS = 0.06;
const ACTIVE_TOUCH_LANES: [boolean, boolean] = [true, true];
const INACTIVE_LANES: [boolean, boolean] = [false, false];

function createRuntime(players: Player[] = []): RuntimeState {
  return {
    activeStageId: 1,
    frozenFrameReady: false,
    lastTimestamp: 0,
    players,
  };
}

function createPlayersForMode(mode: GameMode) {
  return MODE_OPTIONS[mode].players.map((player) => new Player(player.character, player.x));
}

function drawFallbackBackground(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  gradient.addColorStop(0, '#fff0d8');
  gradient.addColorStop(0.58, '#f8c49d');
  gradient.addColorStop(1, '#ee9ba4');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function pauseVideo(video: HTMLVideoElement | null) {
  if (video && !video.paused) {
    video.pause();
  }
}

function playVideo(video: HTMLVideoElement | null, playbackRate: number) {
  if (!video) {
    return;
  }

  video.playbackRate = playbackRate;
  const playPromise = video.play();
  playPromise?.catch(() => {});
}

function seekVideo(video: HTMLVideoElement | null, currentTime: number) {
  if (!video) {
    return;
  }

  try {
    video.currentTime = currentTime;
  } catch {
    // Ignore seek errors until the browser has enough media state.
  }
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function preloadImage(src: string, onAssetLoaded?: () => void) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      onAssetLoaded?.();
      resolve();
    };

    image.onerror = () => {
      reject(new Error(`Unable to load ${src}`));
    };

    image.src = src;
  });
}

function preloadVideoElement(video: HTMLVideoElement | null, onAssetLoaded?: () => void) {
  return new Promise<void>((resolve, reject) => {
    if (!video) {
      reject(new Error('Missing stage video element.'));
      return;
    }

    if (video.readyState >= 2) {
      onAssetLoaded?.();
      resolve();
      return;
    }

    const handleLoaded = () => {
      cleanup();
      onAssetLoaded?.();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Unable to load ${video.currentSrc || video.src}`));
    };

    const cleanup = () => {
      video.removeEventListener('loadeddata', handleLoaded);
      video.removeEventListener('error', handleError);
    };

    video.addEventListener('loadeddata', handleLoaded, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.load();
  });
}

function waitForVideoMetadata(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0) {
      resolve();
      return;
    }

    const handleLoadedMetadata = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Camera preview metadata failed to load.'));
    };

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

function lanesMatch(current: [boolean, boolean], next: [boolean, boolean]) {
  return current[0] === next[0] && current[1] === next[1];
}

function describeVisibilityMode(
  trackedPeopleCount: number,
  trackedLanes: [boolean, boolean],
  primaryCharacter: string,
  secondaryCharacter: string,
) {
  if (trackedPeopleCount >= 2) {
    return {
      detail: `${primaryCharacter} on the left and ${secondaryCharacter} on the right are both live.`,
      headline: '2 People Tracked · Two Player Visibility',
      summary: '2 Players',
    };
  }

  if (trackedPeopleCount === 1) {
    if (trackedLanes[0]) {
      return {
        detail: `Arm movement runs ${primaryCharacter}. Hold still to stop. Hop to jump.`,
        headline: `1 Person Tracked · ${primaryCharacter} Active`,
        summary: 'Single Player',
      };
    }

    if (trackedLanes[1]) {
      return {
        detail: `Arm movement runs ${secondaryCharacter}. Hold still to stop. Hop to jump.`,
        headline: `1 Person Tracked · ${secondaryCharacter} Active`,
        summary: 'Single Player',
      };
    }
  }

  return {
    detail: `Step into frame. Left person controls ${primaryCharacter}, right person controls ${secondaryCharacter}.`,
    headline: 'Waiting For Players',
    summary: 'Waiting',
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frozenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<RuntimeState>(createRuntime(createPlayersForMode(BOOT_MODE)));
  const videoRefs = useRef<Record<StageId, HTMLVideoElement | null>>({
    1: null,
    2: null,
    3: null,
  });
  const webcamRef = useRef<HTMLVideoElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const poseTrackerRef = useRef(createPoseTrackerState());
  const laneHistoriesRef = useRef(createLaneGestureHistories());
  const singlePlayerLaneLockRef = useRef<0 | 1 | null>(null);

  const [phase, setPhase] = useState<AppPhase>('loading');
  const [loadingProgress, setLoadingProgress] = useState(INITIAL_PROGRESS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [showDebugMenu, setShowDebugMenu] = useState(false);
  const [controlMode, setControlMode] = useState<ControlMode>('touch');
  const [showCameraView, setShowCameraView] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('inactive');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [trackedPeopleCount, setTrackedPeopleCount] = useState(2);
  const [trackedLanes, setTrackedLanes] = useState<[boolean, boolean]>(ACTIVE_TOUCH_LANES);

  const modeConfig = MODE_OPTIONS[BOOT_MODE];
  const primaryPlayerConfig = modeConfig.players[0];
  const secondaryPlayerConfig = modeConfig.players[1] ?? modeConfig.players[0];
  const loadingPercent = Math.round(Math.min(1, Math.max(INITIAL_PROGRESS, loadingProgress)) * 100);
  const activeLaneFlags = controlMode === 'visibility' ? trackedLanes : ACTIVE_TOUCH_LANES;
  const visiblePlayerIndexes =
    controlMode === 'visibility'
      ? modeConfig.players
          .map((_, index) => index as 0 | 1)
          .filter((index) => activeLaneFlags[index])
      : modeConfig.players.map((_, index) => index as 0 | 1);
  const visibilityMode = describeVisibilityMode(
    trackedPeopleCount,
    trackedLanes,
    CHARACTER_NAMES[primaryPlayerConfig.character],
    CHARACTER_NAMES[secondaryPlayerConfig.character],
  );
  const cameraStatusLabel = getCameraStatusLabel(cameraStatus, cameraError);

  useEffect(() => {
    if (frozenCanvasRef.current) {
      return;
    }

    const frozenCanvas = document.createElement('canvas');
    frozenCanvas.width = CANVAS_WIDTH;
    frozenCanvas.height = CANVAS_HEIGHT;
    frozenCanvasRef.current = frozenCanvas;
  }, []);

  const syncTrackedState = useEffectEvent((peopleCount: number, nextLanes: [boolean, boolean]) => {
    setTrackedPeopleCount((current) => (current === peopleCount ? current : peopleCount));
    setTrackedLanes((current) => (lanesMatch(current, nextLanes) ? current : nextLanes));
  });

  const resetPlayerInputs = useEffectEvent(() => {
    runtimeRef.current.players.forEach((player) => player.releaseRun());
  });

  const resetLaneTracking = useEffectEvent((nextMode: ControlMode) => {
    laneHistoriesRef.current.forEach((history) => resetLaneGestureHistory(history));
    singlePlayerLaneLockRef.current = null;
    resetPlayerInputs();
    syncTrackedState(nextMode === 'visibility' ? 0 : 2, nextMode === 'visibility' ? INACTIVE_LANES : ACTIVE_TOUCH_LANES);
  });

  const syncHud = useEffectEvent((runtime: RuntimeState) => {
    const nextScores: [number, number] = [
      Math.floor(runtime.players[0]?.score ?? 0),
      Math.floor(runtime.players[1]?.score ?? 0),
    ];

    setHud((current) => {
      if (
        current.stageId === runtime.activeStageId &&
        current.scores[0] === nextScores[0] &&
        current.scores[1] === nextScores[1]
      ) {
        return current;
      }

      return {
        scores: nextScores,
        stageId: runtime.activeStageId,
      };
    });
  });

  const bootIntoGame = useEffectEvent(() => {
    runtimeRef.current = createRuntime(createPlayersForMode(BOOT_MODE));
    setHud(INITIAL_HUD);
    resetLaneTracking(controlMode);

    STAGES.forEach((stage) => {
      const video = videoRefs.current[stage.id];
      if (!video) {
        return;
      }

      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;
      seekVideo(video, LOOP_IN_POINT);

      if (stage.id === 1) {
        playVideo(video, MIN_PLAYBACK_RATE);
        return;
      }

      pauseVideo(video);
    });
  });

  useEffect(() => {
    const hasAllVideoRefs = STAGES.every((stage) => videoRefs.current[stage.id]);
    if (!hasAllVideoRefs) {
      return;
    }

    let cancelled = false;
    const spriteAssetCount = Object.values(CHARACTER_ANIMATIONS).reduce(
      (count, animations) => count + Object.values(animations).length,
      0,
    );
    const totalAssets = STAGES.length + spriteAssetCount + 1;
    let loadedAssets = 0;

    const markLoaded = () => {
      loadedAssets += 1;
      if (cancelled) {
        return;
      }

      setLoadingProgress(Math.max(INITIAL_PROGRESS, loadedAssets / totalAssets));
    };

    const preloadAssets = async () => {
      setLoadError(null);
      setLoadingProgress(INITIAL_PROGRESS);

      try {
        await Promise.all([
          preloadImage(LOADING_SCREEN_ART_SRC, markLoaded),
          preloadSpriteSheets(markLoaded),
          Promise.all(STAGES.map((stage) => preloadVideoElement(videoRefs.current[stage.id], markLoaded))),
          wait(MIN_LOADING_DURATION_MS),
        ]);

        if (cancelled) {
          return;
        }

        setLoadingProgress(1);
        bootIntoGame();
        window.setTimeout(() => {
          if (!cancelled) {
            setPhase('playing');
          }
        }, 140);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : 'Could not finish loading the game.');
      }
    };

    void preloadAssets();

    return () => {
      cancelled = true;
    };
  }, [bootAttempt]);

  const retryBoot = () => {
    setPhase('loading');
    setLoadError(null);
    setLoadingProgress(INITIAL_PROGRESS);
    setBootAttempt((current) => current + 1);
  };

  const restartRun = () => {
    bootIntoGame();
  };

  const pressRun = (playerIndex: number) => {
    runtimeRef.current.players[playerIndex]?.pressRun();
  };

  const releaseRun = (playerIndex: number) => {
    runtimeRef.current.players[playerIndex]?.releaseRun();
  };

  const pressJump = (playerIndex: number) => {
    runtimeRef.current.players[playerIndex]?.pressJump();
  };

  const renderFrame = useEffectEvent((timestamp: number) => {
    if (phase !== 'playing') {
      return;
    }

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) {
      return;
    }

    const runtime = runtimeRef.current;
    const frozenCanvas = frozenCanvasRef.current;
    const frozenCtx = frozenCanvas?.getContext('2d');
    const introVideo = videoRefs.current[1];

    const rawDelta = runtime.lastTimestamp === 0 ? 0.016 : (timestamp - runtime.lastTimestamp) / 1000;
    const deltaTime = rawDelta > 0.1 || rawDelta < 0 ? 0.05 : rawDelta;
    runtime.lastTimestamp = timestamp;

    runtime.players.forEach((player) => player.update(deltaTime));

    const moving = runtime.players.some((player) => player.currentRate > 0.02);
    const targetRate = moving ? Math.max(...runtime.players.map((player) => player.currentRate)) : 0;
    const playbackRate = moving ? Math.max(MIN_PLAYBACK_RATE, targetRate) : 0;

    let activeStage = getStage(runtime.activeStageId);
    let activeVideo = videoRefs.current[runtime.activeStageId];

    if (moving && activeVideo && activeVideo.currentTime >= activeStage.loopEnd) {
      pauseVideo(activeVideo);
      runtime.activeStageId = activeStage.nextStageId;
      activeStage = getStage(runtime.activeStageId);
      activeVideo = videoRefs.current[runtime.activeStageId];
      seekVideo(activeVideo, LOOP_IN_POINT);
    }

    if (moving) {
      playVideo(activeVideo, playbackRate);
    } else {
      pauseVideo(activeVideo);
    }

    if (moving && activeVideo && activeVideo.readyState >= 2) {
      ctx.drawImage(activeVideo, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      if (frozenCtx) {
        frozenCtx.drawImage(activeVideo, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        runtime.frozenFrameReady = true;
      }
    } else if (runtime.frozenFrameReady && frozenCanvas) {
      ctx.drawImage(frozenCanvas, 0, 0);
    } else if (introVideo && introVideo.readyState >= 2) {
      ctx.drawImage(introVideo, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      drawFallbackBackground(ctx);
    }

    runtime.players.forEach((player, index) => {
      if (controlMode === 'visibility' && !activeLaneFlags[index as 0 | 1]) {
        return;
      }

      player.draw(ctx);
    });
    syncHud(runtime);
  });

  useEffect(() => {
    if (phase !== 'playing') {
      return;
    }

    let frameId = 0;
    const step = (timestamp: number) => {
      renderFrame(timestamp);
      frameId = window.requestAnimationFrame(step);
    };

    frameId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [phase]);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (phase !== 'playing' || controlMode !== 'touch') {
      return;
    }

    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault();
      pressRun(0);
    }

    if ((event.code === 'Space' || event.code === 'ArrowUp') && !event.repeat) {
      event.preventDefault();
      pressJump(0);
    }

    if (event.code === 'KeyL') {
      event.preventDefault();
      pressRun(1);
    }

    if (event.code === 'Enter' && !event.repeat) {
      event.preventDefault();
      pressJump(1);
    }
  });

  const handleKeyUp = useEffectEvent((event: KeyboardEvent) => {
    if (phase !== 'playing' || controlMode !== 'touch') {
      return;
    }

    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault();
      releaseRun(0);
    }

    if (event.code === 'KeyL') {
      event.preventDefault();
      releaseRun(1);
    }
  });

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    resetLaneTracking(controlMode);
  }, [controlMode]);

  useEffect(() => {
    if (showCameraView || !debugCanvasRef.current) {
      return;
    }

    const context = debugCanvasRef.current.getContext('2d');
    if (!context) {
      return;
    }

    context.clearRect(0, 0, debugCanvasRef.current.width, debugCanvasRef.current.height);
  }, [showCameraView]);

  useEffect(() => {
    if (phase !== 'playing' || controlMode !== 'visibility') {
      stopMediaStream(cameraStreamRef.current);
      cameraStreamRef.current = null;

      if (webcamRef.current) {
        webcamRef.current.srcObject = null;
      }

      poseTrackerRef.current.lastCaptureTime = -1;
      poseTrackerRef.current.lastVideoTime = -1;
      setCameraStatus('inactive');
      return;
    }

    let cancelled = false;

    const startVisibilityControls = async () => {
      try {
        setCameraError(null);

        if (!poseTrackerRef.current.landmarker) {
          setCameraStatus('loading-model');
          poseTrackerRef.current.landmarker = await createPoseLandmarker();
        }

        if (cancelled) {
          return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser does not support camera access.');
        }

        setCameraStatus('starting-camera');
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA_STREAM_CONSTRAINTS);

        if (cancelled) {
          stopMediaStream(stream);
          return;
        }

        cameraStreamRef.current = stream;

        const cameraElement = webcamRef.current;
        if (!cameraElement) {
          throw new Error('Missing camera preview element.');
        }

        cameraElement.muted = true;
        cameraElement.playsInline = true;
        cameraElement.srcObject = stream;
        await waitForVideoMetadata(cameraElement);
        await cameraElement.play();

        if (cancelled) {
          return;
        }

        setCameraStatus('active');
      } catch (error) {
        if (cancelled) {
          return;
        }

        stopMediaStream(cameraStreamRef.current);
        cameraStreamRef.current = null;

        if (webcamRef.current) {
          webcamRef.current.srcObject = null;
        }

        setCameraError(error instanceof Error ? error.message : 'Unable to start visibility mode.');
        setCameraStatus('error');
      }
    };

    void startVisibilityControls();

    return () => {
      cancelled = true;
      stopMediaStream(cameraStreamRef.current);
      cameraStreamRef.current = null;

      if (webcamRef.current) {
        webcamRef.current.srcObject = null;
      }
    };
  }, [controlMode, phase]);

  const applyVisibilityAssignments = useEffectEvent((assignments: ReadonlyArray<LaneAssignment>, nowMs: number) => {
    const nextLanes: [boolean, boolean] = [false, false];
    const assignmentsByLane: [LaneAssignment | null, LaneAssignment | null] = [null, null];

    assignments.forEach((assignment) => {
      assignmentsByLane[assignment.laneIndex] = assignment;
      nextLanes[assignment.laneIndex] = true;
    });

    runtimeRef.current.players.forEach((player, index) => {
      const assignment = assignmentsByLane[index as 0 | 1];
      const history = laneHistoriesRef.current[index as 0 | 1];

      if (!assignment) {
        player.releaseRun();
        resetLaneGestureHistory(history);
        return;
      }

      const { isRunning, jumpTriggered } = updateLaneGesture(history, assignment.pose, nowMs);

      if (isRunning) {
        player.pressRun();
      } else {
        player.releaseRun();
      }

      if (jumpTriggered) {
        player.pressJump();
      }
    });

    syncTrackedState(assignments.length, nextLanes);
  });

  useEffect(() => {
    if (phase !== 'playing' || controlMode !== 'visibility' || cameraStatus !== 'active') {
      return;
    }

    let frameId = 0;

    const step = () => {
      frameId = window.requestAnimationFrame(step);

      const cameraElement = webcamRef.current;
      const landmarker = poseTrackerRef.current.landmarker;
      if (!cameraElement || !landmarker || cameraElement.readyState < 2) {
        return;
      }

      if (poseTrackerRef.current.lastVideoTime === cameraElement.currentTime) {
        return;
      }

      poseTrackerRef.current.lastVideoTime = cameraElement.currentTime;

      let nowMs = performance.now();
      if (nowMs <= poseTrackerRef.current.lastCaptureTime) {
        nowMs = poseTrackerRef.current.lastCaptureTime + 0.1;
      }

      poseTrackerRef.current.lastCaptureTime = nowMs;

      let assignments: ReadonlyArray<LaneAssignment> = [];

      try {
        const results = landmarker.detectForVideo(cameraElement, nowMs);
        assignments = resolveTrackedLanes(results.landmarks ?? []);

        if (assignments.length === 0) {
          singlePlayerLaneLockRef.current = null;
        } else if (assignments.length === 1) {
          const lockedLane = singlePlayerLaneLockRef.current;
          const assignment = assignments[0];
          const stableLane = lockedLane ?? assignment.laneIndex;

          assignments = [
            {
              ...assignment,
              laneIndex: stableLane,
            },
          ];
          singlePlayerLaneLockRef.current = stableLane;
        } else {
          singlePlayerLaneLockRef.current = null;
        }
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : 'Visibility tracking paused.');
      }

      if (showCameraView && debugCanvasRef.current) {
        drawDebugCameraPreview({
          assignments,
          canvas: debugCanvasRef.current,
          video: cameraElement,
        });
      }

      applyVisibilityAssignments(assignments, nowMs);
    };

    frameId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [applyVisibilityAssignments, cameraStatus, controlMode, phase, showCameraView]);

  return (
    <div className={phase === 'loading' ? 'loading-shell' : 'game-shell'}>
      {phase === 'loading' ? (
        <div className="loading-panel">
          <span className="loading-kicker">Woot Town Runner</span>
          <h1>Loading The Magical Ride</h1>
          <p>
            Preparing the stitched town videos, warming up both runners, and getting touch plus
            visibility controls ready for the launch.
          </p>

          <div className="loading-tags">
            <span>2 Player Mode</span>
            <span>Pose Tracking</span>
            <span>Woot Town Boot</span>
          </div>

          <div className="loading-bar" aria-label={`Loading progress ${loadingPercent}%`}>
            <div className="loading-bar__track" />
            <div className="loading-bar__fill" style={{ width: `${loadingPercent}%` }} />
            <div className="loading-bar__spark" style={{ left: `calc(${loadingPercent}% - 18px)` }}>
              ⭐
            </div>
          </div>

          <div className="loading-meta">
            <span>{loadError ? 'Loading paused' : 'Warming up Woot Town assets'}</span>
            <strong>{loadingPercent}%</strong>
          </div>

          {loadError ? (
            <>
              <p className="loading-error">{loadError}</p>
              <button className="loading-button" onClick={retryBoot}>
                Retry Loading
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <>
          <button
            className={`debug-toggle ${showDebugMenu ? 'debug-toggle--open' : ''}`}
            onClick={() => setShowDebugMenu((current) => !current)}
            type="button"
          >
            Debug
          </button>

          {showDebugMenu ? (
            <aside className="debug-panel">
              <div className="debug-panel__header">
                <h2>Debug Menu</h2>
                <button
                  className="debug-panel__close"
                  onClick={() => setShowDebugMenu(false)}
                  type="button"
                >
                  Close
                </button>
              </div>

              <div className="debug-panel__group">
                <span className="debug-panel__label">Controls</span>
                <div className="debug-segmented">
                  <button
                    className={`debug-segmented__button ${
                      controlMode === 'touch' ? 'debug-segmented__button--active' : ''
                    }`}
                    onClick={() => setControlMode('touch')}
                    type="button"
                  >
                    Touch
                  </button>
                  <button
                    className={`debug-segmented__button ${
                      controlMode === 'visibility' ? 'debug-segmented__button--active' : ''
                    }`}
                    onClick={() => setControlMode('visibility')}
                    type="button"
                  >
                    Visibility
                  </button>
                </div>
              </div>

              {controlMode === 'visibility' ? (
                <label className="debug-checkbox">
                  <input
                    checked={showCameraView}
                    onChange={(event) => setShowCameraView(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Camera View</span>
                </label>
              ) : null}

              <div className="debug-panel__note">
                <strong>{cameraStatusLabel}</strong>
                <span>
                  {controlMode === 'visibility'
                    ? visibilityMode.detail
                    : 'Touch mode keeps both unicorn lanes available for on-screen buttons and keyboard input.'}
                </span>
              </div>
            </aside>
          ) : null}

          <main className="game-stage">
            <canvas ref={canvasRef} className="game-canvas" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />

            <div className="hud-row hud-row--top">
              <div className="hud-cluster">
                {visiblePlayerIndexes.map((index) => {
                  const player = modeConfig.players[index]!;
                  return (
                  <div
                    key={`${player.character}-${index}`}
                    className={`hud-pill ${index === 0 ? 'hud-pill--primary' : 'hud-pill--secondary'} ${
                      controlMode === 'visibility'
                        ? activeLaneFlags[index] ? 'hud-pill--tracked' : 'hud-pill--idle'
                        : ''
                    }`}
                  >
                    <div className="hud-pill__label">
                      P{index + 1} · {CHARACTER_NAMES[player.character]}
                    </div>
                    <div className="hud-pill__value">{hud.scores[index]}</div>
                  </div>
                  );
                })}
              </div>

              <div className="hud-cluster hud-cluster--right">
                <div className="hud-pill hud-pill--stage">
                  <div className="hud-pill__label">Current Loop</div>
                  <div className="hud-pill__value">{getStage(hud.stageId).label}</div>
                </div>

                <div className="hud-pill hud-pill--mode">
                  <div className="hud-pill__label">
                    {controlMode === 'visibility' ? 'Visibility Mode' : 'Control Mode'}
                  </div>
                  <div className="hud-pill__value">
                    {controlMode === 'visibility' ? visibilityMode.summary : 'Touch'}
                  </div>
                </div>

                <button className="hud-action" onClick={restartRun} type="button">
                  Reset Run
                </button>
              </div>
            </div>

            {controlMode === 'touch' ? (
              <div className="hud-row hud-row--bottom">
                <>
                  <div className="control-panel control-panel--primary">
                    <span className="control-panel__label">
                      P1 · {CHARACTER_NAMES[primaryPlayerConfig.character]}
                    </span>
                    <div className="control-panel__buttons">
                      <button
                        className="control-button control-button--run"
                        onPointerDown={() => pressRun(0)}
                        onPointerUp={() => releaseRun(0)}
                        onPointerLeave={() => releaseRun(0)}
                        onPointerCancel={() => releaseRun(0)}
                        type="button"
                      >
                        Run
                      </button>
                      <button
                        className="control-button control-button--jump"
                        onPointerDown={() => pressJump(0)}
                        type="button"
                      >
                        Jump
                      </button>
                    </div>
                  </div>

                  <div className="hud-hint">
                    <span>Touch Mode</span>
                    <strong>{modeConfig.hint}</strong>
                  </div>

                  <div className="control-panel control-panel--secondary">
                    <span className="control-panel__label">
                      P2 · {CHARACTER_NAMES[secondaryPlayerConfig.character]}
                    </span>
                    <div className="control-panel__buttons">
                      <button
                        className="control-button control-button--alt-run"
                        onPointerDown={() => pressRun(1)}
                        onPointerUp={() => releaseRun(1)}
                        onPointerLeave={() => releaseRun(1)}
                        onPointerCancel={() => releaseRun(1)}
                        type="button"
                      >
                        Run
                      </button>
                      <button
                        className="control-button control-button--alt-jump"
                        onPointerDown={() => pressJump(1)}
                        type="button"
                      >
                        Jump
                      </button>
                    </div>
                  </div>
                </>
              </div>
            ) : null}

            {controlMode === 'visibility' && showCameraView ? (
              <div className="camera-preview">
                <canvas
                  ref={debugCanvasRef}
                  className="camera-preview__canvas"
                  height={CAMERA_PREVIEW_HEIGHT}
                  width={CAMERA_PREVIEW_WIDTH}
                />
              </div>
            ) : null}
          </main>

          <video ref={webcamRef} autoPlay className="camera-source-video" muted playsInline />
        </>
      )}

      {STAGES.map((stage) => (
        <video
          key={stage.id}
          ref={(element) => {
            videoRefs.current[stage.id] = element;
          }}
          src={stage.src}
          muted
          playsInline
          preload="auto"
          className="asset-video"
        />
      ))}
    </div>
  );
}
