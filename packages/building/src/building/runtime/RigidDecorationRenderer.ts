import {
  BoundingBox,
  Entity,
  Matrix,
  MeshRenderer,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector3
} from "@galacean/engine";
import { restoreResource } from "@galacean/engine-modify/rendering/RestorableResources";

/** Rigid skin slots, in the same order as the merged draw's per-vertex IDs. */
export interface RigidDecorationBinding {
  id: string;
  inverseBind: readonly number[];
  min: readonly number[];
  max: readonly number[];
}

/** A merged mesh whose parts follow real Scene entities, one matrix per part.
 * Uses the same world * inverse-bind principle as Skin, without blend shapes or weights.
 * The existing resident pipeline owns the BufferMesh and material. */
export class RigidDecorationRenderer extends MeshRenderer {
  private slots: Array<{ binding: RigidDecorationBinding; inverse: Matrix; bounds: BoundingBox }> = [];
  private resolve?: (id: string) => Entity | undefined;
  private texture?: Texture2D;
  private words = new Float32Array(0);
  private readonly worldBounds = new BoundingBox();
  private readonly transformed = new BoundingBox();
  private readonly world = new Matrix();
  private readonly local = new Matrix();
  private readonly normal = new Matrix();
  private readonly inverse = new Matrix();
  private uploaded = false;

  configure(bindings: readonly RigidDecorationBinding[], resolve: (id: string) => Entity | undefined): void {
    this.releaseTexture();
    this.resolve = resolve;
    this.slots = bindings.map((binding) => {
      const inverse = new Matrix();
      inverse.copyFromArray(binding.inverseBind);
      return { binding, inverse, bounds: new BoundingBox(new Vector3(...binding.min), new Vector3(...binding.max)) };
    });
    this.words = new Float32Array(bindings.length * 32);
    this.texture = new Texture2D(this.engine, 8, bindings.length, TextureFormat.R32G32B32A32, false, false);
    this.texture.filterMode = TextureFilterMode.Point;
    this.texture.wrapModeU = this.texture.wrapModeV = TextureWrapMode.Clamp;
    const texture = this.texture,
      words = this.words;
    restoreResource(texture, () => texture.setPixelBuffer(words));
    this.shaderData.setTexture("renderer_DecorationMatrices", texture);
    this.uploaded = false;
    this.sync();
  }

  override get bounds(): BoundingBox {
    // Culling and click-only picking can request bounds before the render update.
    this.sync();
    return this.worldBounds;
  }
  override update(): void {
    this.sync();
  }
  _canBatch(): boolean {
    return false;
  }

  private sync(): void {
    if (!this.texture || !this.resolve) return;
    Matrix.invert(this.entity.transform.worldMatrix, this.inverse);
    this.worldBounds.min.set(Infinity, Infinity, Infinity);
    this.worldBounds.max.set(-Infinity, -Infinity, -Infinity);
    let changed = !this.uploaded,
      visible = false;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i],
        entity = this.resolve(slot.binding.id),
        offset = i * 32;
      if (!entity || entity.destroyed || !entity.isActiveInHierarchy) {
        // Last normal-matrix element doubles as slot visibility, used by both color and pick passes.
        if (this.words[offset + 31] !== 0) {
          this.words[offset + 31] = 0;
          changed = true;
        }
        continue;
      }
      visible = true;
      Matrix.multiply(entity.transform.worldMatrix, slot.inverse, this.world);
      BoundingBox.transform(slot.bounds, this.world, this.transformed);
      Vector3.min(this.worldBounds.min, this.transformed.min, this.worldBounds.min);
      Vector3.max(this.worldBounds.max, this.transformed.max, this.worldBounds.max);
      Matrix.multiply(this.inverse, this.world, this.local);
      Matrix.invert(this.local, this.normal);
      this.normal.transpose();
      changed = this.write(offset, this.local) || changed;
      changed = this.write(offset + 16, this.normal) || changed;
    }
    if (!visible) this.worldBounds.min.copyFrom(this.worldBounds.max.set(0, 0, 0));
    if (changed) {
      this.texture.setPixelBuffer(this.words);
      this.uploaded = true;
    }
  }

  private write(offset: number, matrix: Matrix): boolean {
    let changed = false;
    const elements = matrix.elements;
    for (let j = 0; j < 16; j++) {
      const value = Math.fround(elements[j]);
      if (this.words[offset + j] !== value) {
        this.words[offset + j] = value;
        changed = true;
      }
    }
    return changed;
  }

  private releaseTexture(): void {
    if (!this.texture) return;
    // Renderer ShaderData owns a reference until the slot is cleared. A normal
    // Texture.destroy() refuses to release a still-referenced allocation.
    this.shaderData.setTexture("renderer_DecorationMatrices", null!);
    this.texture.destroy();
    this.texture = undefined;
  }

  protected override _onDestroy(): void {
    this.releaseTexture();
    this.resolve = undefined;
    this.slots.length = 0;
    super._onDestroy();
  }
}
