import { Entity, Script, Signal, Vector3 } from "@galacean/engine";
import { HORSE_PROFILE } from "@galacean/engine-animals/gameplay/horse/HorseProfile";
import type { HorseGround, HorseHost, HorseRideInput } from "@galacean/engine-animals/gameplay/horse/HorseTypes";
import type {
  TerrainNavigationLocomotionOwner,
  TerrainNavigationRuntime
} from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import { sampleSeedWorldHeight, seedWorldOriginX, seedWorldOriginZ, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { SeedWorldSurfaceMaterialIntent } from "@galacean/engine-world-planning/runtime/SeedWorldSurfaceIntent";

/** Live world references; getters follow replacement of a generated world. */
export interface SeedWorldMountHostOptions {
  readonly navigation: TerrainNavigationRuntime;
  /** Presentation scale shared with the mounted model. Defaults to one. */
  readonly mountScale?: number;
  readonly readFields: () => SeedWorldFields | undefined;
  readonly readSurface: () => SeedWorldSurfaceMaterialIntent | undefined;
  /** Tests live water coverage using the authoritative navigation contact surface.
   * @param x World X in metres.
   * @param z World Z in metres.
   * @returns Whether water covers the terrain at this point.
   */
  readonly isWater: (x: number, z: number) => boolean;
  readonly isRoaming: () => boolean;
}

const TRANSITION_SECONDS = 0.65;
const SEATED_EYE_HEIGHT = 0.65;
const STEERING_DEAD_ANGLE = Math.PI / 6;
const JOYSTICK_CENTER_DEAD_ZONE = 0.15;
const KEYBOARD_STEERING_RAMP_SECONDS = 0.2;

/** Samples the exact published terrain alphamap's grass channel alongside its R16 ground height.
 * @param fields Live terrain height field.
 * @param surface Live final RGBA alphamap sent to TerrainClipmap.
 * @param x World X in metres.
 * @param z World Z in metres.
 * @param out Reused ground result.
 * @returns Whether loaded terrain covers the point.
 */
export function sampleSeedWorldMountGround(
  fields: SeedWorldFields | undefined,
  surface: SeedWorldSurfaceMaterialIntent | undefined,
  x: number,
  z: number,
  out: HorseGround
): boolean {
  if (!fields || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  const height = sampleSeedWorldHeight(fields, x, z);
  if (height === undefined) return false;
  out.height = height;
  out.grass = false;
  if (!surface) return true;
  const resolution = surface.resolution;
  const u = Math.max(0, Math.min(1, (x - seedWorldOriginX(fields)) / fields.sizeMetres));
  const v = Math.max(0, Math.min(1, (z - seedWorldOriginZ(fields)) / fields.sizeMetres));
  // Match normalized UV bilinear sampling at texel centres, including edge clamping.
  const px = u * resolution - 0.5;
  const pz = v * resolution - 0.5;
  const x0 = Math.floor(px);
  const z0 = Math.floor(pz);
  const tx = px - x0;
  const tz = pz - z0;
  const clampIndex = (index: number): number => Math.max(0, Math.min(resolution - 1, index));
  const weights = surface.materialWeights;
  const a = weights[(clampIndex(z0) * resolution + clampIndex(x0)) * 4];
  const b = weights[(clampIndex(z0) * resolution + clampIndex(x0 + 1)) * 4];
  const c = weights[(clampIndex(z0 + 1) * resolution + clampIndex(x0)) * 4];
  const d = weights[(clampIndex(z0 + 1) * resolution + clampIndex(x0 + 1)) * 4];
  out.grass = ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz) / 255 >= 0.5;
  return true;
}

/** Transfers Seed navigation movement to a mount while retaining its keyboard, touch and view controls. */
export class SeedWorldMountHost extends Script implements HorseHost, TerrainNavigationLocomotionOwner {
  /** Ground-anchor changes used by mount perception. */
  readonly playerMoved = new Signal<[]>();
  private _options: SeedWorldMountHostOptions | null = null;
  private _saddle: Entity | null = null;
  private _riding = false;
  private _transition = 0;
  private _savedTerrainPitch = false;
  private readonly _position = new Vector3();
  private readonly _lastFoot = new Vector3(Infinity, Infinity, Infinity);
  private readonly _transitionStart = new Vector3();
  private readonly _destination = new Vector3();
  private readonly _eye = new Vector3();
  private readonly _look = new Vector3();
  private readonly _ground: HorseGround = { height: 0, grass: false };
  private _forward = 0;
  private _right = 0;
  private _sprint = false;
  private _joystickForwardSeconds = 0;
  private _lastYaw = 0;
  private _mountYaw = 0;
  private _pendingYawFollow = 0;
  private _handoffYaw = 0;
  private _handoffBlend = 0;

  /** Bind live Seed world services without creating another input system.
   * @param options Current navigation and authoritative terrain getters.
   */
  initialize(options: SeedWorldMountHostOptions): void {
    this._options = options;
    this.readPlayerPosition(this._position);
  }

  /** Bind the animated saddle attachment created by the mount module.
   * @param saddle Seat entity in the horse rig.
   */
  setSaddleAnchor(saddle: Entity): void {
    this._saddle = saddle;
  }

  /** Read the ground anchor below the camera or the mounted rider.
   * @param out Reused world position.
   */
  readPlayerPosition(out: Vector3): void {
    if (this._riding || this._transition > 0) {
      out.copyFrom(this._position);
      return;
    }
    const options = this._options;
    if (!options) {
      out.set(0, 0, 0);
      return;
    }
    out.copyFrom(options.navigation.entity.transform.worldPosition);
    if (this.sampleGround(out.x, out.z, this._ground)) out.y = this._ground.height;
  }

  /** Read world-facing horizontal look, independent of horse rotation.
   * @param out Reused unit direction.
   */
  readPlayerForward(out: Vector3): void {
    const forward = this._options?.navigation.entity.transform.worldForward;
    if (forward && Math.hypot(forward.x, forward.z) > 0.001) this._lastYaw = Math.atan2(forward.x, forward.z);
    // Pending rein follow is already committed camera rotation, not a new look command.
    // Include it so smoothing lag cannot steer the horse back after the reins are released.
    const yaw = this._lastYaw + this._pendingYawFollow;
    out.set(Math.sin(yaw), 0, Math.cos(yaw));
  }

  /** Sample published terrain and alphamap data.
   * @param x World X.
   * @param z World Z.
   * @param out Reused result.
   * @returns Whether the point belongs to the current terrain.
   */
  sampleGround(x: number, z: number, out: HorseGround): boolean {
    const options = this._options;
    const covered = sampleSeedWorldMountGround(options?.readFields(), options?.readSurface(), x, z, out);
    // Alphamaps describe the riverbed too; water ownership decides whether that grass is exposed.
    if (covered && out.grass && options?.isWater(x, z)) out.grass = false;
    return covered;
  }

  /** Transfer movement ownership and blend the camera to the seat or walking anchor.
   * @param riding Requested movement owner.
   * @param position Mount or dismount ground anchor.
   * @param yaw Horse heading used for a smooth initial seat orientation.
   * @returns Whether the transfer could begin.
   */
  setRiding(riding: boolean, position: Readonly<Vector3>, yaw: number): boolean {
    const options = this._options;
    if (!options || (riding && (!options.isRoaming() || !options.navigation.enabled))) return false;
    if (!this.sampleGround(position.x, position.z, this._ground)) return false;
    const nav = options.navigation;
    if (riding && nav.locomotionOwner && nav.locomotionOwner !== this) return false;
    const view = nav.entity.transform.worldForward;
    const difference = yaw - Math.atan2(view.x, view.z);
    this._handoffYaw = riding ? Math.atan2(Math.sin(difference), Math.cos(difference)) : 0;
    this._handoffBlend = 0;
    this._mountYaw = yaw;
    this._pendingYawFollow = 0;
    this._transitionStart.copyFrom(nav.entity.transform.worldPosition);
    this._eye.copyFrom(this._transitionStart);
    this._position.set(position.x, this._ground.height, position.z);
    if (!this._riding && riding) {
      this._savedTerrainPitch = nav.enableTerrainPitch;
      nav.enableTerrainPitch = false;
    }
    this._riding = riding;
    this._transition = TRANSITION_SECONDS;
    this._forward = 0;
    this._right = 0;
    this._sprint = false;
    this._joystickForwardSeconds = 0;
    nav.locomotionOwner = this;
    if (!riding && !options.isRoaming()) {
      this._transition = 0;
      this._releaseNavigation();
    }
    this.playerMoved.invoke();
    return true;
  }

  /** Whether camera ownership is still blending between walking and riding. */
  isRiderTransitioning(): boolean {
    return this._transition > 0;
  }

  /** Consume riding throttle and reins without changing the view.
   * @param right Signed rein input.
   * @param forward Signed throttle or brake.
   * @param sprint Running modifier.
   * @param deltaTime Elapsed seconds used to detect sustained joystick input.
   */
  applyInput(right: number, forward: number, sprint: boolean, deltaTime: number): void {
    const options = this._options;
    const active = !!options && this._riding && options.isRoaming() && options.navigation.enabled && options.navigation.inputEnabled;
    const joystick = options?.navigation.inputMode === "joystick";
    // Horizontal joystick pushes retain small vertical noise; it must not engage the brake.
    this._forward = active && (!joystick || Math.abs(forward) > 0.15) ? Math.max(-1, Math.min(1, forward)) : 0;
    const dt = Math.max(0, Math.min(Number.isFinite(deltaTime) ? deltaTime : 0, 0.1));
    const requestedRight = active && Number.isFinite(right) ? Math.max(-1, Math.min(1, right)) : 0;
    if (joystick) {
      const horizontal = active && Number.isFinite(right) ? right : 0;
      const vertical = active && Number.isFinite(forward) ? forward : 0;
      const magnitude = Math.min(1, Math.hypot(horizontal, vertical));
      // Dragging beyond the disc produces axes above one. Preserve their ratio before clamping strength.
      const angle = Math.atan2(Math.abs(horizontal), Math.abs(vertical));
      const strength = Math.max(0, (angle - STEERING_DEAD_ANGLE) / (Math.PI / 2 - STEERING_DEAD_ANGLE));
      this._right = magnitude <= JOYSTICK_CENTER_DEAD_ZONE
        ? 0
        : Math.sign(requestedRight) * strength * magnitude;
    } else if (requestedRight === 0) {
      this._right = 0;
    } else {
      if (Math.sign(this._right) !== Math.sign(requestedRight)) this._right = 0;
      const step = dt / KEYBOARD_STEERING_RAMP_SECONDS;
      this._right += Math.max(-step, Math.min(step, requestedRight - this._right));
    }
    const holdingForward = active && options.navigation.inputMode === "joystick" && this._forward > 0.1;
    this._joystickForwardSeconds = holdingForward
      ? this._joystickForwardSeconds + dt
      : 0;
    this._sprint = active && (sprint || this._joystickForwardSeconds >= 1 - 1e-6);
  }

  /** Read reused navigation axes; dismount belongs to the command interface.
   * @param out Reused controls.
   */
  readRideInput(out: HorseRideInput): void {
    const active =
      this._options?.isRoaming() && this._options.navigation.enabled && this._options.navigation.inputEnabled;
    if (!active) {
      this._joystickForwardSeconds = 0;
      this._right = 0;
    }
    out.forward = active ? this._forward : 0;
    const speed = this._options?.navigation.movementSpeed ?? 0;
    const roamSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    out.cruiseSpeed = roamSpeed * 1.5;
    out.sprintSpeed = roamSpeed * 2;
    out.sprint = active && this._sprint;
    out.gait = active && this._options?.navigation.inputMode === "joystick" && this._forward > 0.1
      ? out.sprint ? "run" : "walk"
      : undefined;
    if (out.gait === "walk") {
      // Preserve the calibrated walking cadence during the one-second joystick launch.
      out.cruiseSpeed = this.walkingSpeed;
    }
    out.turn = active ? -this._right : 0;
    out.dismount = false;
  }

  /** Walking speed used as the fixed stride baseline, independent of sprint and throttle. */
  get walkingSpeed(): number {
    const speed = this._options?.navigation.movementSpeed ?? 0;
    const roamSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    return this._options?.navigation.inputMode === "joystick"
      ? HORSE_PROFILE.walkSpeed * (this._options?.mountScale ?? 1) * (roamSpeed / 30)
      : roamSpeed * 1.5;
  }

  /** Follow the mount anchor and queue smooth camera rotation from manual rein turns.
   * @param position Current mounted ground position.
   * @param yaw Horse heading.
   */
  updateRider(position: Readonly<Vector3>, yaw: number): void {
    if (!this._riding) return;
    const difference = yaw - this._mountYaw;
    if (this._transition === 0 && Math.abs(this._right) > 0.000001 && this._options?.navigation.inputEnabled) {
      this._pendingYawFollow += Math.atan2(Math.sin(difference), Math.cos(difference));
    }
    this._mountYaw = yaw;
    this._position.copyFrom(position);
    this.playerMoved.invoke();
  }

  /** Update walking and dismount transitions; mounted poses are supplied after animation correction.
   * @param deltaTime Elapsed seconds.
   */
  override onLateUpdate(deltaTime: number): void {
    if (!this._riding) this._updateView(deltaTime);
  }

  /** Follow the corrected animated saddle once per frame.
   * @param deltaTime Elapsed seconds.
   */
  updateRiderPose(deltaTime: number): void {
    if (this._riding) this._updateView(deltaTime);
  }

  private _updateView(deltaTime: number): void {
    const options = this._options;
    if (!options || !options.isRoaming()) return;
    if (!this._riding && this._transition <= 0) {
      this.readPlayerPosition(this._position);
      if (!Vector3.equals(this._position, this._lastFoot)) {
        this._lastFoot.copyFrom(this._position);
        this.playerMoved.invoke();
      }
      return;
    }
    const nav = options.navigation;
    const seat =
      this._riding && this._saddle && !this._saddle.destroyed ? this._saddle.transform.worldPosition : this._position;
    this._destination.set(seat.x, seat.y + (this._riding ? SEATED_EYE_HEIGHT * (options.mountScale ?? 1) : nav.groundClearance), seat.z);
    const dt = Math.min(deltaTime, 0.1);
    if (this._transition > 0) {
      this._transition = Math.max(0, this._transition - dt);
      const t = 1 - this._transition / TRANSITION_SECONDS;
      Vector3.lerp(this._transitionStart, this._destination, t * t * (3 - 2 * t), this._eye);
      this._eye.y += Math.sin(t * Math.PI) * 0.45;
    } else {
      // Terrain elevation and the final saddle pose must move the rider in the same frame.
      this._eye.copyFrom(this._destination);
    }
    nav.entity.transform.setWorldPosition(this._eye.x, this._eye.y, this._eye.z);
    if (this._handoffBlend < 1) {
      const t = 1 - this._transition / TRANSITION_SECONDS;
      const blend = t * t * (3 - 2 * t);
      const rotation = this._handoffYaw * (blend - this._handoffBlend);
      this._handoffBlend = blend;
      if (Math.abs(rotation) > 0.000001) {
        const forward = nav.entity.transform.worldForward;
        const yaw = Math.atan2(forward.x, forward.z) + rotation;
        const horizontal = Math.hypot(forward.x, forward.z);
        this._look.set(
          this._eye.x + Math.sin(yaw) * horizontal,
          this._eye.y + forward.y,
          this._eye.z + Math.cos(yaw) * horizontal
        );
        nav.entity.transform.lookAt(this._look);
        nav.synchronizeView();
      }
    }
    if (this._riding && this._transition === 0 && Math.abs(this._pendingYawFollow) > 0.000001) {
      const rotation = this._pendingYawFollow * (1 - Math.exp(-8 * dt));
      this._pendingYawFollow -= rotation;
      const forward = nav.entity.transform.worldForward;
      const yaw = Math.atan2(forward.x, forward.z) + rotation;
      const horizontal = Math.hypot(forward.x, forward.z);
      this._look.set(this._eye.x + Math.sin(yaw) * horizontal, this._eye.y + forward.y, this._eye.z + Math.cos(yaw) * horizontal);
      nav.entity.transform.lookAt(this._look);
      nav.synchronizeView();
    }
    if (!this._riding && this._transition === 0) this._releaseNavigation();
  }

  /** Restore navigation ownership when this world adapter is destroyed. */
  override onDestroy(): void {
    this._releaseNavigation();
    this.playerMoved.removeAll();
  }

  private _releaseNavigation(): void {
    const nav = this._options?.navigation;
    if (!nav || nav.destroyed || nav.locomotionOwner !== this) return;
    nav.locomotionOwner = null;
    nav.enableTerrainPitch = this._savedTerrainPitch;
    nav.synchronizeView();
  }
}
