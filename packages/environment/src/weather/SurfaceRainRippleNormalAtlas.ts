import {
  ShaderProperty,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  type Engine,
  type Scene
} from "@galacean/engine-core";

const RIPPLE_ATLAS_COLUMNS = 8;
const RIPPLE_ATLAS_ROWS = 8;
const RIPPLE_TILE_SIZE = 64;
const RIPPLE_ATLAS_SIZE = RIPPLE_ATLAS_COLUMNS * RIPPLE_TILE_SIZE;
const RIPPLE_RING_RADIUS_SCALE = 2;
const RIPPLE_RING_BAND_WIDTH_SCALE = 1.5;
const RIPPLE_NORMAL_SLOPE_SCALE = 1.7;
const IS_SRGB_COLOR_SPACE = false;

interface RippleDrop {
  readonly x: number;
  readonly y: number;
  readonly phase: number;
  readonly radius: number;
  readonly strength: number;
}

const RIPPLE_DROPS: readonly RippleDrop[] = [
  { x: 0.19, y: 0.24, phase: 0.03, radius: 0.1, strength: 0.72 },
  { x: 0.47, y: 0.18, phase: 0.61, radius: 0.06, strength: 0.55 },
  { x: 0.76, y: 0.27, phase: 0.28, radius: 0.13, strength: 0.68 },
  { x: 0.32, y: 0.43, phase: 0.79, radius: 0.075, strength: 0.62 },
  { x: 0.64, y: 0.49, phase: 0.14, radius: 0.09, strength: 0.58 },
  { x: 0.83, y: 0.56, phase: 0.47, radius: 0.055, strength: 0.5 },
  { x: 0.16, y: 0.66, phase: 0.92, radius: 0.07, strength: 0.52 },
  { x: 0.43, y: 0.72, phase: 0.36, radius: 0.12, strength: 0.7 },
  { x: 0.7, y: 0.78, phase: 0.7, radius: 0.065, strength: 0.56 },
  { x: 0.86, y: 0.83, phase: 0.19, radius: 0.08, strength: 0.6 }
];

export const SURFACE_RAIN_RIPPLE_NORMAL_ATLAS_PROPERTY = ShaderProperty.getByName("scene_SurfaceRippleNormalAtlas");

export interface SurfaceRainRippleNormalAtlasTextureFactory {
  create(engine: Engine): Texture2D;
}

export interface SurfaceRainRippleNormalAtlasLease {
  readonly texture: Texture2D;
  readonly released: boolean;
  release(): void;
}

interface SurfaceRainRippleNormalAtlasState {
  readonly texture: Texture2D;
  referenceCount: number;
}

const DEFAULT_TEXTURE_FACTORY: SurfaceRainRippleNormalAtlasTextureFactory = {
  create: createSurfaceRainRippleNormalAtlas
};

/** Scene-scoped shared ownership for the Terrain/Water rain-ripple atlas. */
export class SurfaceRainRippleNormalAtlasPool {
  private readonly _states = new WeakMap<Scene, SurfaceRainRippleNormalAtlasState>();

  constructor(private readonly _textureFactory: SurfaceRainRippleNormalAtlasTextureFactory = DEFAULT_TEXTURE_FACTORY) {}

  acquire(scene: Scene): SurfaceRainRippleNormalAtlasLease {
    let state = this._states.get(scene);
    if (!state) {
      const texture = this._textureFactory.create(scene.engine);
      try {
        scene.shaderData.setTexture(SURFACE_RAIN_RIPPLE_NORMAL_ATLAS_PROPERTY, texture);
      } catch (error) {
        texture.destroy();
        throw error;
      }
      state = { texture, referenceCount: 0 };
      this._states.set(scene, state);
    }
    state.referenceCount++;

    let released = false;
    return {
      texture: state.texture,
      get released(): boolean {
        return released;
      },
      release: () => {
        if (released) return;
        released = true;
        this._release(scene, state!);
      }
    };
  }

  private _release(scene: Scene, state: SurfaceRainRippleNormalAtlasState): void {
    if (this._states.get(scene) !== state) return;
    state.referenceCount--;
    if (state.referenceCount > 0) return;

    this._states.delete(scene);
    try {
      scene.shaderData.setTexture(SURFACE_RAIN_RIPPLE_NORMAL_ATLAS_PROPERTY, null!);
    } finally {
      state.texture.destroy();
    }
  }
}

const sharedSurfaceRainRippleNormalAtlasPool = new SurfaceRainRippleNormalAtlasPool();

export function acquireSurfaceRainRippleNormalAtlas(scene: Scene): SurfaceRainRippleNormalAtlasLease {
  return sharedSurfaceRainRippleNormalAtlasPool.acquire(scene);
}

function createSurfaceRainRippleNormalAtlas(engine: Engine): Texture2D {
  const texture = new Texture2D(
    engine,
    RIPPLE_ATLAS_SIZE,
    RIPPLE_ATLAS_SIZE,
    TextureFormat.R8G8B8A8_UNorm,
    false,
    IS_SRGB_COLOR_SPACE
  );
  texture.name = "Surface rain ripple normal atlas";
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = TextureWrapMode.Clamp;
  texture.wrapModeV = TextureWrapMode.Clamp;
  texture.setPixelBuffer(buildRippleNormalAtlasPixels());
  return texture;
}

function buildRippleNormalAtlasPixels(): Uint8Array {
  const pixels = new Uint8Array(RIPPLE_ATLAS_SIZE * RIPPLE_ATLAS_SIZE * 4);
  const frameCount = RIPPLE_ATLAS_COLUMNS * RIPPLE_ATLAS_ROWS;
  const dropCount = RIPPLE_DROPS.length;
  const dropX = new Float64Array(dropCount);
  const dropY = new Float64Array(dropCount);
  const dropRadius = new Float64Array(dropCount);
  const dropInvBand = new Float64Array(dropCount);
  const dropCutoff = new Float64Array(dropCount);
  const dropScale = new Float64Array(dropCount);
  for (let d = 0; d < dropCount; d++) {
    dropX[d] = RIPPLE_DROPS[d].x;
    dropY[d] = RIPPLE_DROPS[d].y;
  }
  for (let frame = 0; frame < frameCount; frame++) {
    const frameX = frame % RIPPLE_ATLAS_COLUMNS;
    const frameY = Math.floor(frame / RIPPLE_ATLAS_COLUMNS);
    const animationTime = frame / frameCount;
    for (let d = 0; d < dropCount; d++) {
      const drop = RIPPLE_DROPS[d];
      const cycle = (animationTime + drop.phase) % 1;
      const radius = (0.006 + cycle * drop.radius) * RIPPLE_RING_RADIUS_SCALE;
      const bandWidth = (0.0045 + cycle * 0.004) * RIPPLE_RING_BAND_WIDTH_SCALE;
      dropRadius[d] = radius;
      dropInvBand[d] = 1 / bandWidth;
      // exp(-u^2) < 1e-7 for |u| > 4.0, so contributions beyond 4 * bandWidth round to 0 in 8-bit channels.
      dropCutoff[d] = bandWidth * 4;
      dropScale[d] = Math.sin(cycle * Math.PI) ** 1.4 * drop.strength * RIPPLE_NORMAL_SLOPE_SCALE;
    }
    const baseRow = frameY * RIPPLE_TILE_SIZE;
    const baseCol = frameX * RIPPLE_TILE_SIZE;
    for (let y = 0; y < RIPPLE_TILE_SIZE; y++) {
      const localY = (y + 0.5) / RIPPLE_TILE_SIZE;
      const rowOffset = (baseRow + y) * RIPPLE_ATLAS_SIZE + baseCol;
      for (let x = 0; x < RIPPLE_TILE_SIZE; x++) {
        const localX = (x + 0.5) / RIPPLE_TILE_SIZE;
        let slopeX = 0;
        let slopeY = 0;
        for (let d = 0; d < dropCount; d++) {
          let deltaX = localX - dropX[d];
          deltaX -= Math.round(deltaX);
          let deltaY = localY - dropY[d];
          deltaY -= Math.round(deltaY);
          const distSq = deltaX * deltaX + deltaY * deltaY;
          const radius = dropRadius[d];
          const cutoff = dropCutoff[d];
          const maxR = radius + cutoff;
          if (distSq > maxR * maxR) continue;
          const minR = radius - cutoff;
          if (minR > 0 && distSq < minR * minR) continue;
          const distance = Math.sqrt(distSq);
          const distanceFromRing = distance - radius;
          const u = distanceFromRing * dropInvBand[d];
          const band = Math.exp(-(u * u));
          const signedBand = Math.sin(u * Math.PI) * band;
          const inverseDistance = distance > 1e-5 ? 1 / distance : 0;
          const strength = signedBand * dropScale[d] * inverseDistance;
          slopeX += deltaX * strength;
          slopeY += deltaY * strength;
        }
        writeNormal(pixels, (rowOffset + x) * 4, -slopeX, -slopeY, 1);
      }
    }
  }
  return pixels;
}

function writeNormal(pixels: Uint8Array, offset: number, x: number, y: number, z: number): void {
  const inverseLength = 1 / Math.sqrt(x * x + y * y + z * z);
  pixels[offset] = encodeNormalChannel(x * inverseLength);
  pixels[offset + 1] = encodeNormalChannel(y * inverseLength);
  pixels[offset + 2] = encodeNormalChannel(z * inverseLength);
  pixels[offset + 3] = 255;
}

function encodeNormalChannel(value: number): number {
  return Math.round((Math.min(Math.max(value, -1), 1) * 0.5 + 0.5) * 255);
}
