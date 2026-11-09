import { BoundingBox, Entity, Matrix, MeshRenderer } from "@galacean/engine";
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

  configure(binding: RigidDecorationBinding, resolve: (id: string) => Entity | undefined): void {
    this.binding = binding;
    this.resolve = resolve;
    this.inverseBind.copyFromArray(binding.inverseBind);
    this.localBounds.min.set(...(binding.min as [number, number, number]));
    this.localBounds.max.set(...(binding.max as [number, number, number]));
    this.sync();
  }
  override get bounds(): BoundingBox {
    this.sync();
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
    const source = this.binding && this.resolve?.(this.binding.id);
    if (!source || source.destroyed || !source.isActiveInHierarchy) {
      this.worldBounds.min.copyFrom(this.worldBounds.max.set(0, 0, 0));
      return false;
    }
    Matrix.multiply(source.transform.worldMatrix, this.inverseBind, this.world);
    if (!Matrix.equals(this.entity.transform.worldMatrix, this.world)) this.entity.transform.worldMatrix = this.world;
    BoundingBox.transform(this.localBounds, this.world, this.worldBounds);
    return true;
  }
  protected override _onDestroy(): void {
    this.binding = undefined;
    this.resolve = undefined;
    super._onDestroy();
  }
}
