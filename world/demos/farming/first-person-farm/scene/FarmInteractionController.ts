import type { GroundTarget } from "@galacean/engine-farming/farming/domain/FarmingGround";
import { Camera, Ray, Script, Vector2, Vector3 } from "@galacean/engine";
import { FreeControl } from "@galacean/engine-animals/controls/FreeControl";
import {
  FARM_EYE_HEIGHT,
  FARM_INTERACTION_DISTANCE,
  FARM_MOVE_SPEED,
  FARM_SOIL_Y,
  getPlotLayout
} from "../config/demo-config.ts";

const WORLD_UP = new Vector3(0, 1, 0);

class FarmFrameDriver extends Script {
  callback: ((deltaTime: number) => void) | null = null;
  override onLateUpdate(deltaTime: number): void {
    this.callback?.(deltaTime);
  }
}

export interface FarmTargetState {
  readonly plotId: string | null;
  readonly distance: number | null;
  readonly ground?: GroundTarget | null;
}

export class FarmInteractionController {
  private readonly control: FreeControl;
  private readonly driver: FarmFrameDriver;
  private readonly pressedKeys = new Set<string>();
  private readonly ray = new Ray();
  private readonly lookTarget = new Vector3();
  private readonly viewportCenter = new Vector2(0.5, 0.5);
  private readonly abort = new AbortController();
  private yaw = 0;
  private pitch = -0.45;
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private paused = false;
  private lockedPlotId: string | null = null;
  private target: FarmTargetState = { plotId: null, distance: null };
  private disposed = false;
  private eyeHeight = FARM_EYE_HEIGHT;

  constructor(
    private readonly camera: Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly resolveInteractionTarget: (ray: Ray, maximumDistance: number) => FarmTargetState,
    private readonly onTargetChange: (target: FarmTargetState) => void,
    private readonly isPointerOverUi: (clientX: number, clientY: number) => boolean = () => false,
    private readonly groundHeight: (x: number, z: number) => number | null = () => 0,
    private readonly plotPosition: (id: string) => readonly [number, number, number] | null = (id) => {
      const p = getPlotLayout(id);
      return p ? [p.worldX, FARM_SOIL_Y, p.worldZ] : null;
    }
  ) {
    const entity = camera.entity;
    this.control = entity.addComponent(FreeControl);
    this.control.floorMock = true;
    this.control.floorY = FARM_EYE_HEIGHT;
    this.control.movementSpeed = FARM_MOVE_SPEED;
    this.control.movementGestureEnabled = false;
    this.control.rotationEnabled = false;
    this.control.setInputEnabled(false);
    this.driver = entity.addComponent(FarmFrameDriver);
    this.driver.callback = (deltaTime) => this.update(deltaTime);
    this.rebaseView();
    this.attachEvents();
  }

  get currentTarget(): FarmTargetState {
    return this.target;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.dragging = false;
      this.pressedKeys.clear();
    }
  }

  lockPlot(plotId: string | null): void {
    this.lockedPlotId = plotId;
    if (plotId)
      this.setTarget({
        plotId,
        distance: this.target.plotId === plotId ? this.target.distance : null,
        ground: this.target.ground
      });
  }

  canActOn(plotId: string): boolean {
    return (
      this.target.plotId === plotId &&
      (this.target.distance === null || this.target.distance <= FARM_INTERACTION_DISTANCE)
    );
  }

  /** Diagnostic framing; omitting eyeHeight restores the normal standing view. */
  focusPlot(plotId: string, eyeHeight = FARM_EYE_HEIGHT): boolean {
    const plot = this.plotPosition(plotId);
    if (!plot || !Number.isFinite(eyeHeight) || eyeHeight < 0.2 || eyeHeight > FARM_EYE_HEIGHT) return false;
    this.focusGround(plot[0], plot[2], eyeHeight);
    return this.target.plotId === plotId;
  }
  focusGround(x: number, z: number, eyeHeight = FARM_EYE_HEIGHT): void {
    this.eyeHeight = eyeHeight;
    const y = this.groundHeight(x, z) ?? 0;
    this.control.floorY = (this.groundHeight(x, z + 2.7) ?? y) + eyeHeight;
    this.camera.entity.transform.setWorldPosition(x, this.control.floorY, z + 2.7);
    this.lookAt(new Vector3(x, y + 0.03, z));
    this.resolveTarget();
  }
  canActOnGround(target: GroundTarget): boolean {
    const g = this.target.ground;
    return Boolean(
      g &&
        g.groundId === target.groundId &&
        g.cellX === target.cellX &&
        g.cellZ === target.cellZ &&
        this.target.distance !== null &&
        this.target.distance <= FARM_INTERACTION_DISTANCE
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.driver.callback = null;
    this.driver.destroy();
    this.control.destroy();
    this.pressedKeys.clear();
  }

  private attachEvents(): void {
    const options = { signal: this.abort.signal };
    window.addEventListener("keydown", (event) => this.onKeyDown(event), options);
    window.addEventListener("keyup", (event) => this.pressedKeys.delete(event.code), options);
    window.addEventListener(
      "blur",
      () => {
        this.pressedKeys.clear();
        this.dragging = false;
      },
      options
    );
    window.addEventListener("pointermove", (event) => this.onPointerMove(event), options);
    window.addEventListener(
      "pointerup",
      (event) => {
        if (event.button === 0) this.dragging = false;
      },
      options
    );
    this.canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        // Dragging cancels the browser's default focus transfer, including into an iframe.
        this.canvas.focus({ preventScroll: true });
        if (this.paused || this.isPointerOverUi(event.clientX, event.clientY)) return;
        this.dragging = true;
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
        this.canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      },
      options
    );
    window.addEventListener(
      "pointercancel",
      () => {
        this.dragging = false;
      },
      options
    );
    this.canvas.addEventListener(
      "lostpointercapture",
      () => {
        this.dragging = false;
      },
      options
    );
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault(), options);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === "Escape" && this.dragging) this.dragging = false;
    if (this.paused || isEditableTarget(event.target)) return;
    if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
      this.pressedKeys.add(event.code);
      event.preventDefault();
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragging || this.paused) return;
    if (!(event.buttons & 1)) {
      this.dragging = false;
      return;
    }
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.yaw += (deltaX / width) * Math.PI * 1.15;
    this.pitch = Math.max(-1.25, Math.min(0.55, this.pitch - (deltaY / height) * Math.PI));
    this.applyView();
  }

  private update(deltaTime: number): void {
    if (this.disposed) return;
    if (!this.paused) {
      const right = Number(this.pressedKeys.has("KeyD")) - Number(this.pressedKeys.has("KeyA"));
      const forward = Number(this.pressedKeys.has("KeyW")) - Number(this.pressedKeys.has("KeyS"));
      if (right || forward) this.control.applyPlanarMovementInput(right, forward, deltaTime);
      const position = this.camera.entity.transform.worldPosition;
      const x = Math.max(-14.5, Math.min(14.5, position.x));
      const z = Math.max(-14.5, Math.min(14.5, position.z));
      this.control.floorY = (this.groundHeight(x, z) ?? position.y - this.eyeHeight) + this.eyeHeight;
      if (x !== position.x || z !== position.z || position.y !== this.control.floorY) {
        this.camera.entity.transform.setWorldPosition(x, this.control.floorY, z);
      }
    }
    if (this.lockedPlotId) return;
    this.resolveTarget();
  }

  private resolveTarget(): void {
    this.camera.viewportPointToRay(this.viewportCenter, this.ray);
    this.setTarget(this.resolveInteractionTarget(this.ray, FARM_INTERACTION_DISTANCE));
  }

  private setTarget(target: FarmTargetState): void {
    const plotChanged =
      target.plotId !== this.target.plotId ||
      target.ground?.groundId !== this.target.ground?.groundId ||
      target.ground?.cellX !== this.target.ground?.cellX ||
      target.ground?.cellZ !== this.target.ground?.cellZ;
    this.target = target;
    if (plotChanged) this.onTargetChange(target);
  }

  private rebaseView(): void {
    const forward = this.camera.entity.transform.worldForward;
    this.yaw = Math.atan2(forward.x, -forward.z);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, forward.y)));
  }

  private lookAt(target: Vector3): void {
    this.camera.entity.transform.lookAt(target, WORLD_UP);
    this.rebaseView();
  }

  private applyView(): void {
    const cosPitch = Math.cos(this.pitch);
    const forward = this.lookTarget.set(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosPitch
    );
    forward.add(this.camera.entity.transform.worldPosition);
    this.camera.entity.transform.lookAt(forward, WORLD_UP);
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
