import {
  ContentRestorer,
  Engine,
  MeshRenderer,
  ShaderMacro,
  ShaderProperty,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector4
} from "@galacean/engine";
import type { ProceduralTreeLeafGpuFrame } from "./ProceduralTreeGenerator";

import type { PlantNormalField } from "./ProceduralPlantGeometry";

const GPU_LEAF_NORMAL_FIELD = ShaderProperty.getByName("renderer_ProceduralTreeLeafNormalField");
const GPU_LEAF_FRAME_MACRO = ShaderMacro.getByName("RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME");
const GPU_LEAF_FRAME_TEXTURE = ShaderProperty.getByName("renderer_ProceduralTreeLeafFrames");
const GPU_LEAF_FRAME_SCALE = ShaderProperty.getByName("renderer_ProceduralTreeLeafFrameScale");
const LEAF_FRAME_TEXELS = 8;
const LEAF_FRAME_FLOATS = LEAF_FRAME_TEXELS * 4;

export type ProceduralTreeLeafGpuFrameScale = readonly [
  widthScale: number,
  heightScale: number,
  additiveHalfExtent: number,
  sourceLodIndex: 0 | 1 | 2 | 3
];

/**
 * Dynamic GPU source for one canonical leaf set shared by every retained-card LOD.
 * CPU work is limited to compiling authoring state into eight texels and uploading dirty records;
 * the vertex shader owns final card position, orientation, and dimensions.
 */
export class ProceduralTreeLeafGpuData {
  readonly texture: Texture2D;
  readonly cardsPerRow: number;

  private readonly _normalField: Vector4;
  private readonly _pixels: Float32Array;
  private _frames: readonly ProceduralTreeLeafGpuFrame[];

  constructor(
    engine: Engine,
    frames: readonly ProceduralTreeLeafGpuFrame[],
    label: string,
    normalField?: PlantNormalField
  ) {
    const origin = normalField?.origin ?? [0, 0, 0];
    this._normalField = new Vector4(origin[0], origin[1], origin[2], normalField?.radialBlend ?? 0);
    const context = webGl2Context(engine);
    const maximumTextureSize = Number(context.getParameter(context.MAX_TEXTURE_SIZE));
    const maximumCardsPerRow = Math.floor(maximumTextureSize / LEAF_FRAME_TEXELS);
    if (maximumCardsPerRow < 1) throw new Error("Procedural leaf GPU frames require room for eight RGBA texels");
    this.cardsPerRow = Math.min(Math.max(frames.length, 1), maximumCardsPerRow);
    const width = this.cardsPerRow * LEAF_FRAME_TEXELS;
    const height = Math.ceil(Math.max(frames.length, 1) / this.cardsPerRow);
    if (height > maximumTextureSize) {
      throw new RangeError(
        `Procedural leaf GPU frame table ${width}x${height} exceeds device texture limit ${maximumTextureSize}`
      );
    }
    this._pixels = new Float32Array(width * height * 4);
    frames.forEach((frame, index) => writeFrame(this._pixels, index * LEAF_FRAME_FLOATS, frame));
    const texture = new Texture2D(engine, width, height, TextureFormat.R32G32B32A32, false, false);
    texture.name = `${label} procedural leaf GPU frames`;
    texture.filterMode = TextureFilterMode.Point;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.setPixelBuffer(this._pixels);
    engine.resourceManager.addContentRestorer(new ProceduralTreeLeafGpuTextureRestorer(texture, this._pixels));
    this.texture = texture;
    this._frames = detachFrames(frames);
  }

  get frames(): readonly ProceduralTreeLeafGpuFrame[] {
    return this._frames;
  }

  /** Binds the shared frame table and this LOD's dimension scale without consuming more vertex attributes. */
  bind(renderer: MeshRenderer, scale: ProceduralTreeLeafGpuFrameScale): void {
    renderer.shaderData.enableMacro(GPU_LEAF_FRAME_MACRO);
    renderer.shaderData.setTexture(GPU_LEAF_FRAME_TEXTURE, this.texture);
    renderer.shaderData.setVector4(GPU_LEAF_NORMAL_FIELD, this._normalField);
    renderer.shaderData.setVector4(GPU_LEAF_FRAME_SCALE, new Vector4(scale[0], scale[1], scale[2], scale[3]));
  }

  /** Uploads only changed canonical records; every LOD referencing the same index observes the edit immediately. */
  update(frames: readonly ProceduralTreeLeafGpuFrame[]): number {
    if (frames.length !== this._frames.length) {
      throw new RangeError("Procedural leaf GPU frame updates cannot change canonical leaf topology");
    }
    let changed = 0;
    for (let index = 0; index < frames.length; index++) {
      const previous = this._frames[index];
      const frame = frames[index];
      if (frame.leafId !== previous.leafId) {
        throw new RangeError(
          `Procedural leaf GPU frame index ${index} changed identity from ${previous.leafId} to ${frame.leafId}`
        );
      }
      if (framesEqual(previous, frame)) continue;
      const floatOffset = index * LEAF_FRAME_FLOATS;
      writeFrame(this._pixels, floatOffset, frame);
      const x = (index % this.cardsPerRow) * LEAF_FRAME_TEXELS;
      const y = Math.floor(index / this.cardsPerRow);
      this.texture.setPixelBuffer(
        this._pixels.subarray(floatOffset, floatOffset + LEAF_FRAME_FLOATS),
        0,
        x,
        y,
        LEAF_FRAME_TEXELS,
        1
      );
      changed++;
    }
    this._frames = detachFrames(frames);
    return changed;
  }

  destroy(): void {
    this.texture.destroy();
  }
}

class ProceduralTreeLeafGpuTextureRestorer extends ContentRestorer<Texture2D> {
  constructor(
    resource: Texture2D,
    private readonly _pixels: Float32Array
  ) {
    super(resource);
  }

  restoreContent(): void {
    this.resource.setPixelBuffer(this._pixels);
  }
}

function webGl2Context(engine: Engine): WebGL2RenderingContext {
  const nativeCanvas = (engine.canvas as unknown as { _webCanvas: HTMLCanvasElement | OffscreenCanvas })._webCanvas;
  const context = nativeCanvas.getContext("webgl2") as WebGL2RenderingContext | null;
  if (!context) throw new Error("Procedural leaf GPU frames require WebGL2 vertex texture fetch");
  return context;
}

function writeFrame(target: Float32Array, offset: number, frame: ProceduralTreeLeafGpuFrame): void {
  target.set(frame.pivot, offset);
  target[offset + 3] = frame.width;
  target.set(frame.right, offset + 4);
  target[offset + 7] = frame.height;
  target.set(frame.up, offset + 8);
  target[offset + 11] = 0;
  target.set(frame.normal, offset + 12);
  target[offset + 15] = frame.tangentHandedness;
  for (let lodIndex = 0; lodIndex < 4; lodIndex++) {
    const fieldOffset = offset + 16 + lodIndex * 4;
    target.set(frame.canopyNormalMomentByLod[lodIndex], fieldOffset);
    target[fieldOffset + 3] = frame.canopyOpticalDepthByLod[lodIndex];
  }
}

function framesEqual(left: ProceduralTreeLeafGpuFrame, right: ProceduralTreeLeafGpuFrame): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.canopyOpticalDepth === right.canopyOpticalDepth &&
    left.canopyOpticalDepthByLod.every((value, lodIndex) => value === right.canopyOpticalDepthByLod[lodIndex]) &&
    left.canopyNormalMomentByLod.every((moment, lodIndex) =>
      moment.every((value, axis) => value === right.canopyNormalMomentByLod[lodIndex][axis])
    ) &&
    left.tangentHandedness === right.tangentHandedness &&
    left.pivot.every((value, axis) => value === right.pivot[axis]) &&
    left.right.every((value, axis) => value === right.right[axis]) &&
    left.up.every((value, axis) => value === right.up[axis]) &&
    left.normal.every((value, axis) => value === right.normal[axis])
  );
}

function detachFrames(frames: readonly ProceduralTreeLeafGpuFrame[]): readonly ProceduralTreeLeafGpuFrame[] {
  return frames.map((frame) => ({
    ...frame,
    pivot: [...frame.pivot],
    right: [...frame.right],
    up: [...frame.up],
    normal: [...frame.normal],
    canopyOpticalDepthByLod: [...frame.canopyOpticalDepthByLod],
    canopyNormalMomentByLod: frame.canopyNormalMomentByLod.map((moment) => [
      ...moment
    ]) as unknown as ProceduralTreeLeafGpuFrame["canopyNormalMomentByLod"]
  }));
}
