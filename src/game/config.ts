export const CANVAS_WIDTH = 752;
export const CANVAS_HEIGHT = 560;
export const LOADING_SCREEN_ART_SRC = '/loading/boot-screen.png';

export const FLOOR_Y = CANVAS_HEIGHT - 30;
export const GRAVITY = 0.65;
export const JUMP_FORCE = -16;
export const RUN_LERP = 0.12;
export const SCORE_RATE = 10;
export const MIN_PLAYBACK_RATE = 0.0625;
export const LOOP_IN_POINT = 0.05;

export const SPRITE_FRAME_WIDTH = 486;
export const SPRITE_FRAME_HEIGHT = 1190;
export const SPRITE_DRAW_WIDTH = 150;
export const SPRITE_DRAW_HEIGHT = Math.round(
  (SPRITE_DRAW_WIDTH * SPRITE_FRAME_HEIGHT) / SPRITE_FRAME_WIDTH,
);
export const SPRITE_Y_OFFSET = 55;

export const CHARACTER_ANIMATIONS = {
  mama: {
    idle: {
      src: '/sprites/mama-idle.png',
      frames: 20,
      fps: 14,
      loop: true,
    },
    startRun: {
      src: '/sprites/mama-start-run.png',
      frames: 21,
      fps: 18,
      loop: false,
    },
    jump: {
      src: '/sprites/mama-jump.png',
      frames: 42,
      fps: 20,
      loop: false,
    },
  },
  baby: {
    idle: {
      src: '/sprites/baby-idle.png',
      frames: 25,
      fps: 14,
      loop: true,
    },
    startRun: {
      src: '/sprites/baby-start-run.png',
      frames: 22,
      fps: 18,
      loop: false,
    },
    jump: {
      src: '/sprites/baby-jump.png',
      frames: 42,
      fps: 20,
      loop: false,
    },
  },
} as const;

export type CharacterId = keyof typeof CHARACTER_ANIMATIONS;
export type AnimationId = keyof (typeof CHARACTER_ANIMATIONS)['mama'];

export const CHARACTER_NAMES: Record<CharacterId, string> = {
  mama: 'Mama',
  baby: 'Baby',
};

export const MODE_OPTIONS = {
  '1p': {
    title: 'Solo Sprint',
    description: 'Baby takes the stitched town loop solo with touch or keyboard controls.',
    hint: 'Hold RUN to gallop · Tap JUMP to leap',
    players: [
      {
        character: 'baby',
        x: 110,
      },
    ],
  },
  '2p': {
    title: 'Double Dash',
    description: 'Mama and Baby share the same stage with one control lane each.',
    hint: 'P1: D + Space · P2: L + Enter',
    players: [
      {
        character: 'mama',
        x: 40,
      },
      {
        character: 'baby',
        x: 390,
      },
    ],
  },
} as const satisfies Record<
  string,
  {
    title: string;
    description: string;
    hint: string;
    players: ReadonlyArray<{
      character: CharacterId;
      x: number;
    }>;
  }
>;

export type GameMode = keyof typeof MODE_OPTIONS;

export const STAGES = [
  {
    id: 1,
    label: 'Stage 1',
    src: '/video/stage-1.mp4',
    loopEnd: 9.75,
    nextStageId: 2,
  },
  {
    id: 2,
    label: 'Stage 2',
    src: '/video/stage-2.mp4',
    loopEnd: 4.88,
    nextStageId: 3,
  },
  {
    id: 3,
    label: 'Stage 3',
    src: '/video/stage-3.mp4',
    loopEnd: 4.23,
    nextStageId: 2,
  },
] as const;

export type StageId = (typeof STAGES)[number]['id'];

export function getStage(stageId: StageId) {
  const stage = STAGES.find((item) => item.id === stageId);

  if (!stage) {
    throw new Error(`Unknown stage id: ${stageId}`);
  }

  return stage;
}
