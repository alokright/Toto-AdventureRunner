import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const VISION_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const POSE_MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const WRIST_LEFT_INDEX = 15;
const WRIST_RIGHT_INDEX = 16;
const HIP_LEFT_INDEX = 23;
const HIP_RIGHT_INDEX = 24;

const HISTORY_SIZE = 10;
const RUN_VARIANCE_THRESHOLD = 0.015;
const JUMP_DELTA_THRESHOLD = 0.035;
const JUMP_COOLDOWN_MS = 800;
const MIRRORED_LANE_SPLIT = 0.5;

export const CAMERA_PREVIEW_WIDTH = 320;
export const CAMERA_PREVIEW_HEIGHT = 240;

export const CAMERA_STREAM_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    width: 640,
    height: 480,
    facingMode: 'user',
  },
};

export type ControlMode = 'touch' | 'visibility';
export type CameraStatus = 'inactive' | 'loading-model' | 'starting-camera' | 'active' | 'error';
export type LaneIndex = 0 | 1;

export type PosePoint = {
  x: number;
  y: number;
};

export type PoseSample = ReadonlyArray<PosePoint>;

export type LaneAssignment = {
  laneIndex: LaneIndex;
  pose: PoseSample;
};

export type LaneGestureHistory = {
  hipsY: number[];
  lastJumpTime: number;
  wristsY: number[];
};

export type LaneGestureUpdate = {
  isRunning: boolean;
  jumpTriggered: boolean;
};

export type PoseTrackerState = {
  landmarker: PoseLandmarker | null;
  lastCaptureTime: number;
  lastVideoTime: number;
};

function average(values: ReadonlyArray<number | undefined>) {
  const filtered = values.filter((value): value is number => Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }

  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function averageAbsoluteDeviation(values: ReadonlyArray<number>) {
  if (!values.length) {
    return 0;
  }

  const baseline = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + Math.abs(value - baseline), 0) / values.length;
}

function getPoseCenterX(pose: PoseSample) {
  return pose[0]?.x ?? MIRRORED_LANE_SPLIT;
}

function getPoseMetrics(pose: PoseSample) {
  const hipsY = average([pose[HIP_LEFT_INDEX]?.y, pose[HIP_RIGHT_INDEX]?.y]);
  const wristsY = average([pose[WRIST_LEFT_INDEX]?.y, pose[WRIST_RIGHT_INDEX]?.y]);

  if (hipsY === null || wristsY === null) {
    return null;
  }

  return {
    hipsY,
    wristsY,
  };
}

function trimHistory(values: number[]) {
  while (values.length > HISTORY_SIZE) {
    values.shift();
  }
}

export function createPoseTrackerState(): PoseTrackerState {
  return {
    landmarker: null,
    lastCaptureTime: -1,
    lastVideoTime: -1,
  };
}

export function createLaneGestureHistories(): [LaneGestureHistory, LaneGestureHistory] {
  return [
    {
      hipsY: [],
      lastJumpTime: 0,
      wristsY: [],
    },
    {
      hipsY: [],
      lastJumpTime: 0,
      wristsY: [],
    },
  ];
}

export function resetLaneGestureHistory(history: LaneGestureHistory) {
  history.hipsY.length = 0;
  history.lastJumpTime = 0;
  history.wristsY.length = 0;
}

export async function createPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      delegate: 'GPU',
      modelAssetPath: POSE_MODEL_ASSET_URL,
    },
    numPoses: 2,
    runningMode: 'VIDEO',
  });
}

export function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function resolveTrackedLanes(poses: ReadonlyArray<PoseSample>) {
  const limitedPoses = poses.slice(0, 2);

  if (limitedPoses.length === 0) {
    return [];
  }

  if (limitedPoses.length === 1) {
    const lonePose = limitedPoses[0];
    const laneIndex: LaneIndex = getPoseCenterX(lonePose) >= MIRRORED_LANE_SPLIT ? 0 : 1;

    return [
      {
        laneIndex,
        pose: lonePose,
      },
    ];
  }

  return [...limitedPoses]
    .sort((firstPose, secondPose) => getPoseCenterX(secondPose) - getPoseCenterX(firstPose))
    .map((pose, index) => ({
      laneIndex: index as LaneIndex,
      pose,
    }));
}

export function updateLaneGesture(
  history: LaneGestureHistory,
  pose: PoseSample,
  nowMs: number,
): LaneGestureUpdate {
  const metrics = getPoseMetrics(pose);

  if (!metrics) {
    resetLaneGestureHistory(history);
    return {
      isRunning: false,
      jumpTriggered: false,
    };
  }

  history.hipsY.push(metrics.hipsY);
  history.wristsY.push(metrics.wristsY);
  trimHistory(history.hipsY);
  trimHistory(history.wristsY);

  const earliestHip = history.hipsY[0] ?? metrics.hipsY;
  const jumpTriggered =
    earliestHip - metrics.hipsY > JUMP_DELTA_THRESHOLD &&
    nowMs - history.lastJumpTime > JUMP_COOLDOWN_MS;

  if (jumpTriggered) {
    history.lastJumpTime = nowMs;
  }

  const isRunning =
    history.wristsY.length === HISTORY_SIZE &&
    averageAbsoluteDeviation(history.wristsY) > RUN_VARIANCE_THRESHOLD;

  return {
    isRunning,
    jumpTriggered,
  };
}

export function drawDebugCameraPreview({
  assignments,
  canvas,
  video,
}: {
  assignments: ReadonlyArray<LaneAssignment>;
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
}) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const laneColors: Record<LaneIndex, string> = {
    0: '#ff78b4',
    1: '#58d2ba',
  };

  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, width, height);
  context.restore();

  context.fillStyle = 'rgba(12, 16, 27, 0.14)';
  context.fillRect(0, 0, width, height);

  context.save();
  context.setLineDash([8, 6]);
  context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(width / 2, 0);
  context.lineTo(width / 2, height);
  context.stroke();
  context.restore();

  assignments.forEach(({ laneIndex, pose }) => {
    const color = laneColors[laneIndex];

    pose.forEach((point) => {
      context.beginPath();
      context.arc((1 - point.x) * width, point.y * height, 3, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    });
  });
}

export function getCameraStatusLabel(status: CameraStatus, errorMessage?: string | null) {
  switch (status) {
    case 'loading-model':
      return 'Loading visibility model';
    case 'starting-camera':
      return 'Starting camera';
    case 'active':
      return 'Camera active';
    case 'error':
      return errorMessage || 'Camera unavailable';
    case 'inactive':
    default:
      return 'Camera inactive';
  }
}
