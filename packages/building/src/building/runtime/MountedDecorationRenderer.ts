import { BoolUpdateFlag, BoundingBox, Entity, Matrix, MeshRenderer } from "@galacean/engine";
import type { RigidDecorationBinding } from "./RigidDecorationRenderer";

/** Native frame draws already contain one attachment. Keep their original shader
 * and instance ABI; move the derived draw by the real author's world × inverse-bind.
 * Merged timber/glass draws still use RigidDecorationRenderer's per-vertex slots. */
export class MountedDecorationRenderer extends MeshRenderer {
  private binding?: RigidDecorationBinding;
  private resolve?: (id: string) => Entity | undefined;
  private readonly inverseBind = new Matrix();
  private readonly world = new Matrix();
  private readonly localBounds = new BoundingBox();
  private readonly worldBounds = new BoundingBox();
  private sourceEntity?: Entity;
  private sourceFlag?: BoolUpdateFlag;
  private sourceVisible = false;
  private lastSyncFrame = -1;
  private dirty = true;

  configure(binding: RigidDecorationBinding, resolve: (id: string) => Entity | undefined): void {
    this.sourceFlag?.destroy();
    this.sourceFlag = undefined;
    this.sourceEntity = undefined;
    this.binding = binding;
    this.resolve = resolve;
    this.inverseBind.copyFromArray(binding.inverseBind);
    this.localBounds.min.set(...(binding.min as [number, number, number]));
    this.localBounds.max.set(...(binding.max as [number, number, number]));
    this.dirty = true;
    this.lastSyncFrame = -1;
    this.sync();
  }
  override get bounds(): BoundingBox {
    const frame = this.engine.time.frameCount;
    if (this.dirty || this.lastSyncFrame !== frame) {
      this.sync();
    }
    return this.worldBounds;
  }
  override update(): void {
    this.sync();
  }
  protected override _render(context: Parameters<MeshRenderer["_render"]>[0]): void {
    if (this.sync()) super._render(context);
  }
  _canBatch(): boolean {
    return false;
  }

  private sync(): boolean {
    const frame = this.engine.time.frameCount;
    const source = this.binding && this.resolve?.(this.binding.id);
    if (source !== this.sourceEntity) {
      this.sourceFlag?.destroy();
      this.sourceEntity = source;
      this.sourceFlag = source && !source.destroyed ? source.registerWorldChangeFlag() : undefined;
      this.dirty = true;
    }
    const visible = !!source && !source.destroyed && source.isActiveInHierarchy;
    if (!this.dirty && visible === this.sourceVisible && (!visible || !this.sourceFlag?.flag)) {
      this.lastSyncFrame = frame;
      return visible;
    }
    this.dirty = false;
    this.lastSyncFrame = frame;
    this.sourceVisible = visible;
    if (this.sourceFlag) this.sourceFlag.flag = false;
    if (!visible) {
      this.worldBounds.min.copyFrom(this.worldBounds.max.set(0, 0, 0));
      return false;
    }
    Matrix.multiply(source.transform.worldMatrix, this.inverseBind, this.world);
    if (!Matrix.equals(this.entity.transform.worldMatrix, this.world)) this.entity.transform.worldMatrix = this.world;
    BoundingBox.transform(this.localBounds, this.world, this.worldBounds);
    return true;
  }
  protected override _onDestroy(): void {
    this.sourceFlag?.destroy();
    this.sourceFlag = undefined;
    this.sourceEntity = undefined;
    this.binding = undefined;
    this.resolve = undefined;
    super._onDestroy();
  }
}
