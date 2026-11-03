import { Vector3, type Camera } from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { createShowcaseCameraController, type ShowcaseCameraController } from "../demo/showcase/ShowcaseCameraControl.ts";

/** One camera transform shared by orbit and the existing Water WASDQE controls. */
export class WaterPreviewCamera {
  private orbit: OrbitControl;
  private readonly free: ShowcaseCameraController;
  private distance = 50;
  private freeMode = false;

  constructor(private readonly camera: Camera) {
    this.orbit = this.createOrbit();
    this.free = createShowcaseCameraController(camera.entity, { mode: "free", movementSpeed: 40 });
    this.free.setFreeControlActive(false);
  }
  private createOrbit(): OrbitControl {
    const orbit = this.camera.entity.addComponent(OrbitControl);
    orbit.enableKeys = false;
    orbit.minDistance = 2;
    orbit.maxDistance = 3000;
    orbit.minPolarAngle = 0.01;
    orbit.maxPolarAngle = Math.PI - 0.01;
    return orbit;
  }
  get mode(): "orbit" | "free" {
    return this.freeMode ? "free" : "orbit";
  }
  setMode(mode: "orbit" | "free"): void {
    if ((mode === "free") === this.freeMode) return;
    const transform = this.camera.entity.transform;
    if (mode === "free") {
      this.distance = Vector3.distance(transform.worldPosition, this.orbit.target);
      this.orbit.enabled = false;
      this.free.setFreeControlActive(true);
    } else {
      this.free.setFreeControlActive(false);
      // A new OrbitControl clears stale damping. Its target lies on the current view ray,
      // so returning to orbit keeps both position and direction, rather than snapping back.
      this.orbit.destroy();
      this.orbit = this.createOrbit();
      const p = transform.worldPosition,
        f = transform.worldForward;
      this.orbit.target.set(p.x + f.x * this.distance, p.y + f.y * this.distance, p.z + f.z * this.distance);
    }
    this.freeMode = mode === "free";
  }
  focus(x: number, y: number, z: number, span: number): void {
    this.orbit.target.set(x, y, z);
    this.camera.entity.transform.setPosition(x + span * 0.8, y + span * 0.8, z + span * 1.05);
    this.camera.entity.transform.lookAt(this.orbit.target);
    this.distance = Vector3.distance(this.camera.entity.transform.worldPosition, this.orbit.target);
    this.free.syncFromTransform();
  }
  focusView(target: readonly [number, number, number], position: readonly [number, number, number]): void {
    this.orbit.target.set(...target);
    this.camera.entity.transform.setPosition(...position);
    this.camera.entity.transform.lookAt(this.orbit.target);
    this.distance = Vector3.distance(this.camera.entity.transform.worldPosition, this.orbit.target);
    this.free.syncFromTransform();
  }
  destroy(): void {
    this.free.destroy();
    this.orbit.destroy();
  }
}
