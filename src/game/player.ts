import {
  CHARACTER_ANIMATIONS,
  FLOOR_Y,
  GRAVITY,
  JUMP_FORCE,
  RUN_LERP,
  SCORE_RATE,
  SPRITE_DRAW_HEIGHT,
  SPRITE_DRAW_WIDTH,
  SPRITE_FRAME_HEIGHT,
  SPRITE_FRAME_WIDTH,
  SPRITE_Y_OFFSET,
  type AnimationId,
  type CharacterId,
} from './config';

const PLAYER_STATES = {
  idle: 'idle',
  startRun: 'startRun',
  jump: 'jump',
} as const;

type PlayerState = (typeof PLAYER_STATES)[keyof typeof PLAYER_STATES];

const spriteSheets = createSpriteSheets();

function createSpriteSheets() {
  const sheets = {} as Record<CharacterId, Record<AnimationId, HTMLImageElement>>;

  (Object.entries(CHARACTER_ANIMATIONS) as Array<
    [CharacterId, (typeof CHARACTER_ANIMATIONS)[CharacterId]]
  >).forEach(([character, animations]) => {
    sheets[character] = {} as Record<AnimationId, HTMLImageElement>;

    (Object.entries(animations) as Array<
      [AnimationId, (typeof CHARACTER_ANIMATIONS)[CharacterId][AnimationId]]
    >).forEach(([animation, definition]) => {
      const image = new Image();
      image.src = definition.src;
      sheets[character][animation] = image;
    });
  });

  return sheets;
}

function waitForImage(image: HTMLImageElement, onAssetLoaded?: () => void) {
  if (image.complete) {
    if (image.naturalWidth > 0) {
      onAssetLoaded?.();
      return Promise.resolve();
    }

    return Promise.reject(new Error(`Unable to load sprite asset: ${image.src}`));
  }

  return new Promise<void>((resolve, reject) => {
    const handleLoad = () => {
      cleanup();
      onAssetLoaded?.();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Unable to load sprite asset: ${image.src}`));
    };

    const cleanup = () => {
      image.removeEventListener('load', handleLoad);
      image.removeEventListener('error', handleError);
    };

    image.addEventListener('load', handleLoad, { once: true });
    image.addEventListener('error', handleError, { once: true });
  });
}

export function preloadSpriteSheets(onAssetLoaded?: () => void) {
  const images = (Object.values(spriteSheets) as Array<Record<AnimationId, HTMLImageElement>>).flatMap(
    (animations) => Object.values(animations),
  );

  return Promise.all(images.map((image) => waitForImage(image, onAssetLoaded))).then(() => undefined);
}

export class Player {
  readonly character: CharacterId;
  readonly x: number;
  y = FLOOR_Y;
  velocityY = 0;
  grounded = true;
  runHeld = false;
  currentRate = 0;
  score = 0;
  frame = 0;
  frameTick = 0;
  animationComplete = false;
  state: PlayerState = PLAYER_STATES.idle;

  constructor(character: CharacterId, x: number) {
    this.character = character;
    this.x = x;
  }

  get animation() {
    return CHARACTER_ANIMATIONS[this.character][this.state];
  }

  get sprite() {
    return spriteSheets[this.character][this.state];
  }

  pressRun() {
    this.runHeld = true;
  }

  releaseRun() {
    this.runHeld = false;
  }

  pressJump() {
    if (!this.grounded) {
      return;
    }

    this.runHeld = true;
    this.velocityY = JUMP_FORCE;
    this.grounded = false;
    this.setState(PLAYER_STATES.jump);
  }

  update(deltaTime: number) {
    const targetRate = this.runHeld ? 1 : 0;
    this.currentRate += (targetRate - this.currentRate) * RUN_LERP;

    if (this.grounded) {
      if (this.state === PLAYER_STATES.jump) {
        this.setState(this.runHeld ? PLAYER_STATES.startRun : PLAYER_STATES.idle);
      } else if (this.runHeld && this.state === PLAYER_STATES.idle) {
        this.setState(PLAYER_STATES.startRun);
      } else if (this.runHeld && this.state === PLAYER_STATES.startRun && this.animationComplete) {
        this.resetAnimation();
      } else if (!this.runHeld && this.state !== PLAYER_STATES.idle) {
        this.setState(PLAYER_STATES.idle);
      }
    }

    if (!this.grounded) {
      this.velocityY += GRAVITY;
      this.y += this.velocityY;

      if (this.y >= FLOOR_Y) {
        this.y = FLOOR_Y;
        this.velocityY = 0;
        this.grounded = true;
      }
    }

    this.advanceAnimation(deltaTime);

    if (this.runHeld) {
      this.score += this.currentRate * deltaTime * SCORE_RATE;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const sprite = this.sprite;
    if (!sprite.complete || sprite.naturalWidth === 0) {
      return;
    }

    const sourceX = this.frame * SPRITE_FRAME_WIDTH;
    const drawX = Math.round(this.x);
    const drawY = Math.round(this.y - SPRITE_DRAW_HEIGHT + SPRITE_Y_OFFSET);

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(
      drawX + SPRITE_DRAW_WIDTH / 2,
      Math.round(FLOOR_Y + 10),
      SPRITE_DRAW_WIDTH * 0.38,
      8,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();

    ctx.drawImage(
      sprite,
      sourceX,
      0,
      SPRITE_FRAME_WIDTH,
      SPRITE_FRAME_HEIGHT,
      drawX,
      drawY,
      SPRITE_DRAW_WIDTH,
      SPRITE_DRAW_HEIGHT,
    );
  }

  private advanceAnimation(deltaTime: number) {
    const millisecondsPerFrame = 1000 / this.animation.fps;
    this.frameTick += deltaTime * 1000;

    while (this.frameTick >= millisecondsPerFrame) {
      this.frameTick -= millisecondsPerFrame;

      if (this.frame < this.animation.frames - 1) {
        this.frame += 1;
        continue;
      }

      if (this.animation.loop) {
        this.frame = 0;
        continue;
      }

      this.animationComplete = true;
    }
  }

  private resetAnimation() {
    this.frame = 0;
    this.frameTick = 0;
    this.animationComplete = false;
  }

  private setState(nextState: PlayerState) {
    if (this.state === nextState) {
      return;
    }

    this.state = nextState;
    this.resetAnimation();
  }
}
