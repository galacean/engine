import {
  BoolUpdateFlag,
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
  private slots: Array<{
    binding: RigidDecorationBinding;
    inverse: Matrix;
    bounds: BoundingBox;
    entity?: Entity;
    flag?: BoolUpdateFlag;
    active: boolean;
  }> = [];
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
  private dirty = true;
  private selfFlag?: BoolUpdateFlag;

  configure(bindings: readonly RigidDecorationBinding[], resolve: (id: string) => Entity | undefined): void {
    this.releaseFlags();
    this.releaseTexture();
    this.resolve = resolve;
    this.selfFlag = this.entity.registerWorldChangeFlag();
    this.slots = bindings.map((binding) => {
      const inverse = new Matrix();
      inverse.copyFromArray(binding.inverseBind);
      return {
        binding,
        inverse,
        bounds: new BoundingBox(new Vector3(...binding.min), new Vector3(...binding.max)),
        active: false
      };
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
    this.dirty = true;
    this.sync();
  }

  override get bounds(): BoundingBox {
    // The source can move, deactivate or be replaced between two reads in the same frame.
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
    let needsRecompute = !this.uploaded || this.dirty || (this.selfFlag?.flag ?? true);
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const entity = this.resolve(slot.binding.id);
      const active = !!entity && !entity.destroyed && entity.isActiveInHierarchy;
      if (entity !== slot.entity) {
        slot.flag?.destroy();
        slot.entity = entity;
        slot.flag = entity && !entity.destroyed ? entity.registerWorldChangeFlag() : undefined;
        needsRecompute = true;
      }
      if (active !== slot.active || (active && slot.flag?.flag)) {
        needsRecompute = true;
      }
    }
    if (!needsRecompute) {
      return;
    }

    if (this.selfFlag) this.selfFlag.flag = false;
    Matrix.invert(this.entity.transform.worldMatrix, this.inverse);
    this.worldBounds.min.set(Infinity, Infinity, Infinity);
    this.worldBounds.max.set(-Infinity, -Infinity, -Infinity);
    let changed = !this.uploaded,
      visible = false;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i],
        entity = slot.entity,
        offset = i * 32;
      const active = !!entity && !entity.destroyed && entity.isActiveInHierarchy;
      slot.active = active;
      if (slot.flag) slot.flag.flag = false;
      if (!active) {
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
    this.dirty = false;
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

  private releaseFlags(): void {
    this.selfFlag?.destroy();
    this.selfFlag = undefined;
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].flag?.destroy();
      this.slots[i].flag = undefined;
      this.slots[i].entity = undefined;
    }
  }

  protected override _onDestroy(): void {
    this.releaseFlags();
    this.releaseTexture();
    this.resolve = undefined;
    this.slots.length = 0;
    super._onDestroy();
  }
}
