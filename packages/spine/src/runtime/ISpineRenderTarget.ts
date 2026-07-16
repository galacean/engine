import type { BoundingBox, Buffer, Material, SubPrimitive, Texture2D } from "@galacean/engine";
import type { SpineBlendMode } from "../enums/SpineBlendMode";

/**
 * The write target a spine core package's generator fills while building the renderable primitive.
 *
 * @remarks
 * Implemented by `SpineAnimationRenderer` for both world-space and UI-hosted rendering.
 * This is the narrow, spine-core-free contract that lets the version-specific generator live in a
 * core package while the buffer/material/bounds bookkeeping stays in the shared renderer — the
 * analogue of how engine physics colliders expose a native handle.
 */
export interface ISpineRenderTarget {
  readonly _vertices: Float32Array;
  readonly _indices: Uint16Array;
  readonly _vertexCount: number;
  readonly _localBounds: BoundingBox;
  readonly _subPrimitives: SubPrimitive[];
  readonly _vertexBuffer: Buffer;
  readonly _indexBuffer: Buffer;
  readonly zSpacing: number;
  readonly premultipliedAlpha: boolean;
  readonly tintBlack: boolean;
  /**
   * Host-level alpha modulation (e.g. UI group alpha), multiplied into the final vertex alpha
   * during generation — before premultiplication, so PMA color/dark-color scaling follows it.
   */
  readonly globalAlpha: number;
  _needResizeBuffer: boolean;

  _createAndBindBuffer(vertexCount: number): void;
  _addSubPrimitive(subPrimitive: SubPrimitive): void;
  _clearSubPrimitives(): void;
  _getMaterial(texture: Texture2D, blendMode: SpineBlendMode): Material;
  setMaterial(index: number, material: Material): void;
}
