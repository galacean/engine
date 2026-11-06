import { Entity, Quaternion, Vector3 } from "@galacean/engine";

export const FARM_ITEM_RETRACTION_SECONDS = 0.25;

function pose(entity: Entity) {
  return {
    entity,
    position: entity.transform.position.clone(),
    rotation: entity.transform.rotationQuaternion.clone(),
    scale: entity.transform.scale.clone()
  };
}

/** Blend a captured local hierarchy into the presenter's current target pose. */
export class FarmItemRetraction {
  private readonly from: ReturnType<typeof pose>[] = [];
  private readonly targets: ReturnType<typeof pose>[] = [];
  private hasTargets = false;
  private elapsed = 0;
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();

  constructor(
    root: Entity,
    private readonly duration = FARM_ITEM_RETRACTION_SECONDS
  ) {
    const visit = (entity: Entity) => {
      this.from.push(pose(entity));
      this.targets.push(pose(entity));
      for (const child of entity.children) visit(child);
    };
    visit(root);
  }

  get remaining(): number {
    return Math.max(0, this.duration - this.elapsed);
  }

  /** Remove last frame's blend before the presenter computes current resting pose. */
  restore(): void {
    if (!this.hasTargets) return;
    for (const target of this.targets) {
      if (target.entity.destroyed) continue;
      const transform = target.entity.transform;
      transform.position = target.position;
      transform.rotationQuaternion = target.rotation;
      transform.scale = target.scale;
    }
  }

  apply(seconds: number): boolean {
    this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, seconds));
    const progress = this.elapsed / this.duration;
    const t = progress * progress * (3 - 2 * progress);
    // Capture every target before changing the hierarchy, reusing its pose storage.
    for (const target of this.targets) {
      if (target.entity.destroyed) continue;
      const transform = target.entity.transform;
      target.position.copyFrom(transform.position);
      target.rotation.copyFrom(transform.rotationQuaternion);
      target.scale.copyFrom(transform.scale);
    }
    this.hasTargets = true;
    for (const from of this.from) {
      if (from.entity.destroyed) continue;
      const transform = from.entity.transform;
      Vector3.lerp(from.position, transform.position, t, this.position);
      Quaternion.slerp(from.rotation, transform.rotationQuaternion, t, this.rotation);
      Vector3.lerp(from.scale, transform.scale, t, this.scale);
      transform.position = this.position;
      transform.rotationQuaternion = this.rotation;
      transform.scale = this.scale;
    }
    return progress < 1;
  }
}
