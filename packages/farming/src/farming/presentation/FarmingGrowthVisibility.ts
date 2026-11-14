import { BoundingBox, BoundingFrustum, Matrix, type Camera, type Vector3 } from "@galacean/engine";

/** World-space metres; hysteresis prevents repeated toggles at the draw boundary. */
export const FARM_CROP_DRAW_DISTANCE = Object.freeze({ hide: 60, show: 50 });

/** Reuses math objects; the host supplies a conservative growth envelope, independent of current mesh age. */
export class FarmingGrowthVisibility {
  private readonly frustum = new BoundingFrustum();
  private readonly matrix = new Matrix();
  private readonly bounds = new BoundingBox();
  withinDrawDistance(center: Vector3, cameraPosition: Vector3, wasVisible: boolean): boolean {
    const distance = wasVisible ? FARM_CROP_DRAW_DISTANCE.hide : FARM_CROP_DRAW_DISTANCE.show;
    const dx = center.x - cameraPosition.x,
      dy = center.y - cameraPosition.y,
      dz = center.z - cameraPosition.z;
    return dx * dx + dy * dy + dz * dz <= distance * distance;
  }
  update(camera: Camera): void {
    Matrix.multiply(camera.projectionMatrix, camera.viewMatrix, this.matrix);
    this.frustum.calculateFromMatrix(this.matrix);
  }
  priority(center: Vector3, radius: number, cameraPosition: Vector3, selected: boolean): number {
    this.bounds.min.set(center.x - radius, center.y - radius, center.z - radius);
    this.bounds.max.set(center.x + radius, center.y + radius, center.z + radius);
    if (!this.frustum.intersectsBox(this.bounds)) return -1;
    if (selected) return 2;
    return Math.hypot(center.x - cameraPosition.x, center.z - cameraPosition.z) < 6 ? 1 : 0;
  }
}
