/*
 * Derived from Galacean engine-toolkit controls v1.6.0 (b89bb15f).
 * Source: https://github.com/galacean/engine-toolkit/tree/v1.6.0/packages/controls/src
 * Copyright (c) 2025 Galacean. Licensed under the MIT License.
 * See LICENSE.engine-toolkit in this directory.
 */

import { type Entity, MathUtil, Rect, Script, type Transform, Vector2, Vector3 } from "@galacean/engine";
import { FreeControlInputUi, type FreeControlPointerInputTarget } from "./FreeControlInputUi";
import { FreeControlJoystickUi, type FreeControlJoystickVisualState } from "./FreeControlJoystickUi";

const WORLD_UP = new Vector3(0, 1, 0);
const DEFAULT_MAX_PITCH = MathUtil.degreeToRadian(89);
const ROTATION_EPSILON = 1e-6;

/** Reads the committed world-space ground normal from a locomotion or physics owner. */
export type TerrainNormalProvider = (outNormal: Vector3) => boolean;

/** Resolves a stable terrain-reference pitch at one world-space position and heading. */
export type TerrainPitchProvider = (worldX: number, worldZ: number, yaw: number) => number | null;

interface WebCanvasContainer {
  readonly _webCanvas?: HTMLCanvasElement | OffscreenCanvas;
}

/**
 * World Engine's mobile-first roaming camera control.
 *
 * A pointer is assigned once, from its initial position, to either movement or
 * view rotation. One movement pointer and one rotation pointer may be active at
 * the same time. Keyboard input is intentionally not part of this component,
 * but scene-specific owners may feed movement through applyPlanarMovementInput().
 */
export class FreeControl extends Script implements FreeControlPointerInputTarget {
  private static readonly _touchSurfaces = new WeakMap<
    HTMLCanvasElement,
    { ownerCount: number; previousTouchAction: string; previousTapHighlightColor: string }
  >();

  /** Clicks owned by the world input surface, after HUD hit testing. */
  onWorldPointerClick?: () => void;

  /** Normalized viewport region that starts movement gestures. Defaults to the bottom 40%. */
  movementArea = new Rect(0, 0.6, 1, 0.4);

  /** Normalized viewport region that starts view gestures. Defaults to the top 60%. */
  rotationArea = new Rect(0, 0, 1, 0.6);

  /** Portrait: top look, bottom move. Landscape: left move, right look. */
  orientationTouchAreas = false;
  private _touchLandscape: boolean | undefined;

  /** Maximum planar movement distance per second in world units. */
  movementSpeed = 1;

  /** Multiplier applied to the analog joystick response. */
  movementSensitivity = 1;

  /** Multiplier applied to touch-drag view rotation. */
  rotationSensitivity = 1;

  /** Time, in seconds, for the current view to converge to the touch target. Set to 0 for immediate rotation. */
  rotationSmoothTime = 0.08;

  /** Maximum pitch above the horizon, in radians. */
  maxPitch = DEFAULT_MAX_PITCH;

  /** Minimum pitch below the horizon, in radians. */
  minPitch = -DEFAULT_MAX_PITCH;

  /** Whether movement preserves camera pitch relative to the current terrain slope. */
  enableTerrainPitch = false;

  /** Supplies the normal committed by the same ground contact that positioned the camera. */
  terrainNormalProvider: TerrainNormalProvider | null = null;

  /** Supplies a spatially filtered terrain pitch when the locomotion owner can sample surrounding heights. */
  terrainPitchProvider: TerrainPitchProvider | null = null;

  /** Maximum terrain-derived pitch contribution, in radians. */
  terrainPitchMaxOffset = Math.PI / 12;

  /** Time, in seconds, for the terrain pitch contribution to converge. */
  terrainPitchSmoothTime = 0.3;

  /** Seconds of actual planar motion used to sample an anticipatory terrain target. */
  terrainPitchLookAheadTime = 0;

  /** Maximum world-space look-ahead distance. Set to 0 to disable anticipation. */
  terrainPitchLookAheadMaxDistance = 0;

  /** Maximum automatic terrain-pitch angular speed, in radians per second. Set to 0 for no limit. */
  terrainPitchMaxSpeed = 0;

  /** Whether movement gestures can be acquired and applied. */
  movementEnabled = true;

  /** Whether pointer gestures may acquire movement without disabling external movement input. */
  get movementGestureEnabled(): boolean {
    return this._movementGestureEnabled;
  }

  set movementGestureEnabled(enabled: boolean) {
    if (enabled === this._movementGestureEnabled) return;
    this._movementGestureEnabled = enabled;
    if (!enabled && this.movementActive) this._releaseMovementPointer();
  }

  /** Whether view gestures can be acquired and applied. */
  rotationEnabled = true;

  /** Whether to constrain the camera to a fixed world-space height. */
  floorMock = true;

  /** Fixed world-space height used while {@link floorMock} is enabled. */
  floorY = 0;

  /** Radius of the dynamic joystick background in CSS pixels. */
  joystickRadius = 56;

  /** Radius of the dynamic joystick knob in CSS pixels. */
  joystickKnobRadius = 18;

  /** Normalized joystick dead zone in the range [0, 1). */
  joystickDeadZone = 0.08;

  /** Maximum delta time accepted by movement, preventing large jumps after a suspended frame. */
  maxMovementDeltaTime = 0.05;

  /** Whether this component currently owns a movement pointer. */
  get movementActive(): boolean {
    return this._movementPointerId !== -1;
  }

  /** Whether this component currently owns a rotation pointer. */
  get rotationActive(): boolean {
    return this._rotationPointerId !== -1;
  }

  /** Whether pointer input is currently accepted. */
  get inputEnabled(): boolean {
    return this._inputEnabled;
  }

  /** Galacean UI entity that owns the generated joystick images, once created. */
  get joystickEntity(): Entity | null {
    return this._joystickUi.entity;
  }

  /** Device-independent presentation state, also available before Galacean UI is instantiated. */
  get joystickVisualState(): FreeControlJoystickVisualState {
    return this._joystickUi.state;
  }

  private readonly _cameraTransform: Transform;
  private readonly _movementOrigin = new Vector2();
  private readonly _pointerCssPosition = new Vector2();
  private readonly _rotationLastPosition = new Vector2();
  private readonly _movementInput = new Vector2();
  private readonly _moveVector = new Vector3();
  private readonly _forward = new Vector3();
  private readonly _right = new Vector3();
  private readonly _lookTarget = new Vector3();
  private readonly _terrainNormal = new Vector3();
  private readonly _lastTerrainPosition = new Vector3();
  private readonly _inputUi: FreeControlInputUi;
  private readonly _joystickUi: FreeControlJoystickUi;
  private _movementPointerId = -1;
  private _rotationPointerId = -1;
  private _movementGestureEnabled = true;
  private _inputEnabled = true;
  private _viewInitialized = false;
  private _yaw = 0;
  private _pitch = 0;
  private _targetYaw = 0;
  private _targetPitch = 0;
  private _terrainPitch = 0;
  private _targetTerrainPitch = 0;
  private _terrainPitchVelocity = 0;
  private _planarMovementDeltaX = 0;
  private _planarMovementDeltaZ = 0;
  private _terrainPitchReady = false;
  private _terrainPitchActive = false;
  private _lastTerrainNormalProvider: TerrainNormalProvider | null = null;
  private _lastTerrainPitchProvider: TerrainPitchProvider | null = null;
  private _touchSurface: HTMLCanvasElement | null = null;

  constructor(entity: Entity) {
    super(entity);
    this._cameraTransform = entity.transform;
    this._inputUi = new FreeControlInputUi(entity, this);
    this._joystickUi = new FreeControlJoystickUi(entity);
  }

  override onAwake(): void {
    this._acquireTouchSurface();
    this._inputUi.setEnabled(this._inputEnabled);
    this.synchronizeView();
  }

  override onEnable(): void {
    this._acquireTouchSurface();
    this._inputUi.setEnabled(this._inputEnabled);
    this.synchronizeView();
  }

  override onDisable(): void {
    this._resetPointers();
    this._inputUi.setEnabled(false);
    this._joystickUi.hide(true);
    this._cancelPendingRotation();
    this._releaseTouchSurface();
  }

  override onDestroy(): void {
    this._resetPointers();
    this._inputUi.destroy();
    this._joystickUi.destroy();
    this._releaseTouchSurface();
  }

  /**
   * Enables or disables touch ownership without disabling post-movement constraints.
   * Disabling input immediately releases active gestures and hides the joystick.
   */
  setInputEnabled(enabled: boolean): void {
    if (enabled === this._inputEnabled) return;
    this._inputEnabled = enabled;
    this._inputUi.setEnabled(enabled && this.enabled);
    if (!enabled) {
      this._resetPointers();
      this._cancelPendingRotation();
    } else {
      this.synchronizeView();
    }
  }

  /** @internal Receives one InputManager-owned drag after UI raycast arbitration. */
  handlePointerBeginDrag(pointerId: number, screenX: number, screenY: number): void {
    if (!this._inputEnabled) return;
    const position = this._screenToClientPosition(screenX, screenY);
    const bounds = this._getInputBounds();
    if (!position || !bounds) return;
    this._updateTouchAreas(bounds.width, bounds.height);
    const normalizedX = (position.x - bounds.left) / bounds.width;
    const normalizedY = (position.y - bounds.top) / bounds.height;
    if (
      this.movementEnabled &&
      this._movementGestureEnabled &&
      this._movementPointerId === -1 &&
      this._contains(this.movementArea, normalizedX, normalizedY)
    ) {
      this._movementPointerId = pointerId;
      this._beginMovementPointer(position.x, position.y);
    } else if (
      this.rotationEnabled &&
      this._rotationPointerId === -1 &&
      this._contains(this.rotationArea, normalizedX, normalizedY)
    ) {
      this._rotationPointerId = pointerId;
      this._beginRotationPointer(position.x, position.y);
    }
  }

  /** @internal Applies movement only after the InputManager emits a real drag. */
  handlePointerDrag(pointerId: number, screenX: number, screenY: number): void {
    const position = this._screenToClientPosition(screenX, screenY);
    if (!position) return;
    if (pointerId === this._movementPointerId) {
      if (!this._joystickUi.state.visible) this._showJoystick();
      this._updateMovementPointer(position.x, position.y);
    } else if (pointerId === this._rotationPointerId) {
      this._updateRotationPointer(position.x, position.y);
    }
  }

  /** @internal Releases the drag path assigned by the InputManager. */
  handlePointerEndDrag(pointerId: number): void {
    if (pointerId === this._movementPointerId) this._releaseMovementPointer();
    if (pointerId === this._rotationPointerId) this._releaseRotationPointer();
  }

  /** Rebuilds the smoothed yaw and pitch from the camera's current world orientation. */
  synchronizeView(): void {
    const forward = this._cameraTransform.worldForward;
    const yaw = Math.atan2(forward.x, -forward.z);
    const cameraPitch = Math.asin(MathUtil.clamp(forward.y, -1, 1));
    this._yaw = this._targetYaw = yaw;
    this._terrainPitchActive =
      this.enableTerrainPitch && (this.terrainPitchProvider !== null || this.terrainNormalProvider !== null);
    this._lastTerrainNormalProvider = this.terrainNormalProvider;
    this._lastTerrainPitchProvider = this.terrainPitchProvider;
    const terrainPitch = this._terrainPitchActive ? this._sampleTerrainPitch(yaw) : null;
    this._terrainPitchReady = terrainPitch !== null;
    this._terrainPitch = this._targetTerrainPitch = terrainPitch ?? 0;
    this._terrainPitchVelocity = 0;
    this._pitch = this._targetPitch = MathUtil.clamp(
      cameraPitch - this._terrainPitch,
      this.minPitch - this._terrainPitch,
      this.maxPitch - this._terrainPitch
    );
    this._lastTerrainPosition.copyFrom(this._cameraTransform.worldPosition);
    this._viewInitialized = true;
  }

  /**
   * Applies camera-relative analog movement on the world XZ plane.
   * Inputs inside the unit circle preserve their magnitude; values outside it are clamped.
   */
  applyPlanarMovementInput(right: number, forward: number, deltaTime: number): void {
    if (!this.movementEnabled || !Number.isFinite(right) || !Number.isFinite(forward)) return;
    const inputMagnitude = Math.hypot(right, forward);
    if (inputMagnitude <= MathUtil.zeroTolerance) return;

    const sensitivity = this._finiteNonNegative(this.movementSensitivity);
    const speed = this._finiteNonNegative(this.movementSpeed);
    const safeDeltaTime = Math.min(
      this._finiteNonNegative(deltaTime),
      this._finiteNonNegative(this.maxMovementDeltaTime)
    );
    if (sensitivity === 0 || speed === 0 || safeDeltaTime === 0) return;

    const strength = Math.min(1, inputMagnitude * sensitivity);
    const directionScale = strength / inputMagnitude;
    const transformForward = this._cameraTransform.worldForward;
    this._forward.set(transformForward.x, 0, transformForward.z);
    if (this._forward.lengthSquared() <= MathUtil.zeroTolerance) {
      this._forward.set(Math.sin(this._yaw), 0, -Math.cos(this._yaw));
    } else {
      this._forward.normalize();
    }
    this._right.set(-this._forward.z, 0, this._forward.x);
    this._moveVector
      .copyFrom(this._right)
      .scale(right * directionScale)
      .add(this._forward.scale(forward * directionScale))
      .scale(speed * safeDeltaTime);
    this._cameraTransform.worldPosition.add(this._moveVector);
  }

  override onLateUpdate(deltaTime: number): void {
    if (this.orientationTouchAreas) {
      const bounds = this._getInputBounds();
      if (bounds) this._updateTouchAreas(bounds.width, bounds.height);
    }
    if (!this._viewInitialized) this.synchronizeView();
    if (!this._inputEnabled) this._resetPointers();
    if ((!this.movementEnabled || !this._movementGestureEnabled) && this.movementActive) {
      this._releaseMovementPointer();
    }
    if (!this.rotationEnabled) {
      if (this.rotationActive) this._releaseRotationPointer();
      this._cancelPendingRotation();
    }

    if (this.movementActive && this.movementEnabled) {
      this.applyPlanarMovementInput(this._movementInput.x, this._movementInput.y, deltaTime);
    }

    this.onBeforeViewUpdate(deltaTime);

    if (this.floorMock) {
      const position = this._cameraTransform.worldPosition;
      if (position.y !== this.floorY) this._cameraTransform.setWorldPosition(position.x, this.floorY, position.z);
    }
    const moved = this._consumePlanarMovement();
    this._synchronizeTerrainPitchConfiguration();
    this._updateTerrainPitchTarget(moved, deltaTime);
    this._applySmoothedRotation(deltaTime);
    this._joystickUi.update(deltaTime);
  }

  /** Allows a locomotion owner to commit movement and ground contact before view effects are evaluated. */
  protected onBeforeViewUpdate(_deltaTime: number): void {}

  /** Adds manual yaw/right and pitch/up deltas in radians through the shared smoothed view path. */
  protected applyViewRotationInput(deltaYaw: number, deltaPitch: number): void {
    if (!this._inputEnabled || !this.rotationEnabled || !Number.isFinite(deltaYaw) || !Number.isFinite(deltaPitch))
      return;
    if (deltaYaw === 0 && deltaPitch === 0) return;
    if (!this._viewInitialized) this.synchronizeView();
    this._targetYaw += deltaYaw;
    const currentCameraPitch = Math.asin(MathUtil.clamp(this._cameraTransform.worldForward.y, -1, 1));
    const targetCameraPitch = MathUtil.clamp(
      this._targetPitch + this._targetTerrainPitch + deltaPitch,
      this.minPitch,
      this.maxPitch
    );
    if (this._rebaseTerrainPitchForManualView(this._targetYaw, currentCameraPitch, targetCameraPitch)) return;
    this._targetPitch = targetCameraPitch - this._targetTerrainPitch;
  }

  private _beginMovementPointer(clientX: number, clientY: number): void {
    this._movementOrigin.set(clientX, clientY);
    this._movementInput.set(0, 0);
  }

  private _updateMovementPointer(clientX: number, clientY: number): void {
    this._pointerCssPosition.set(clientX, clientY);
    const deltaX = this._pointerCssPosition.x - this._movementOrigin.x;
    const deltaY = this._pointerCssPosition.y - this._movementOrigin.y;
    const distance = Math.hypot(deltaX, deltaY);
    const radius = Math.max(1, this._finiteNonNegative(this.joystickRadius));
    const knobRadius = Math.min(radius - 1, this._finiteNonNegative(this.joystickKnobRadius));
    const maximumDistance = Math.max(1, radius - knobRadius);
    const visualScale = distance > maximumDistance ? maximumDistance / distance : 1;
    this._setJoystickKnob(deltaX * visualScale, deltaY * visualScale);

    const normalizedDistance = distance / maximumDistance;
    const deadZone = MathUtil.clamp(this._finiteNonNegative(this.joystickDeadZone), 0, 0.99);
    const strength = Math.max(0, (normalizedDistance - deadZone) / (1 - deadZone));
    const directionScale = distance > MathUtil.zeroTolerance ? strength / distance : 0;
    this._movementInput.set(deltaX * directionScale, -deltaY * directionScale);
  }

  private _beginRotationPointer(clientX: number, clientY: number): void {
    this._rotationLastPosition.set(clientX, clientY);
    const cameraPitch = Math.asin(MathUtil.clamp(this._cameraTransform.worldForward.y, -1, 1));
    const targetCameraPitch = MathUtil.clamp(
      cameraPitch + (this._targetPitch - this._pitch),
      this.minPitch,
      this.maxPitch
    );
    this._rebaseTerrainPitchForManualView(this._targetYaw, cameraPitch, targetCameraPitch);
  }

  private _updateRotationPointer(clientX: number, clientY: number): void {
    const deltaX = clientX - this._rotationLastPosition.x;
    const deltaY = clientY - this._rotationLastPosition.y;
    this._rotationLastPosition.set(clientX, clientY);
    if (deltaX === 0 && deltaY === 0) return;
    const bounds = this._getInputBounds();
    if (!bounds) return;
    const sensitivity = this._finiteNonNegative(this.rotationSensitivity);
    this.applyViewRotationInput(
      (deltaX / bounds.width) * Math.PI * sensitivity,
      -(deltaY / bounds.height) * Math.PI * sensitivity
    );
  }

  private _applySmoothedRotation(deltaTime: number): void {
    const yawDelta = this._targetYaw - this._yaw;
    const pitchDelta = this._targetPitch - this._pitch;
    const terrainPitchDelta = this._targetTerrainPitch - this._terrainPitch;
    if (
      Math.abs(yawDelta) <= ROTATION_EPSILON &&
      Math.abs(pitchDelta) <= ROTATION_EPSILON &&
      Math.abs(terrainPitchDelta) <= ROTATION_EPSILON &&
      Math.abs(this._terrainPitchVelocity) <= ROTATION_EPSILON
    ) {
      return;
    }

    const smoothTime = this._finiteNonNegative(this.rotationSmoothTime);
    const safeDeltaTime = this._finiteNonNegative(deltaTime);
    const alpha = smoothTime <= ROTATION_EPSILON ? 1 : 1 - Math.exp(-safeDeltaTime / smoothTime);
    this._yaw += yawDelta * alpha;
    this._pitch += pitchDelta * alpha;
    this._applyCriticallyDampedTerrainPitch(safeDeltaTime);
    if (Math.abs(this._targetYaw - this._yaw) <= ROTATION_EPSILON) this._yaw = this._targetYaw;
    if (Math.abs(this._targetPitch - this._pitch) <= ROTATION_EPSILON) this._pitch = this._targetPitch;
    if (Math.abs(this._targetTerrainPitch - this._terrainPitch) <= ROTATION_EPSILON) {
      this._terrainPitch = this._targetTerrainPitch;
      this._terrainPitchVelocity = 0;
    }

    const cameraPitch = MathUtil.clamp(this._pitch + this._terrainPitch, this.minPitch, this.maxPitch);
    const cosPitch = Math.cos(cameraPitch);
    this._forward.set(Math.sin(this._yaw) * cosPitch, Math.sin(cameraPitch), -Math.cos(this._yaw) * cosPitch);
    this._lookTarget.copyFrom(this._cameraTransform.worldPosition).add(this._forward);
    this._cameraTransform.lookAt(this._lookTarget, WORLD_UP);
  }

  private _consumePlanarMovement(): boolean {
    const position = this._cameraTransform.worldPosition;
    const deltaX = (this._planarMovementDeltaX = position.x - this._lastTerrainPosition.x);
    const deltaZ = (this._planarMovementDeltaZ = position.z - this._lastTerrainPosition.z);
    this._lastTerrainPosition.copyFrom(position);
    return deltaX * deltaX + deltaZ * deltaZ > MathUtil.zeroTolerance * MathUtil.zeroTolerance;
  }

  private _synchronizeTerrainPitchConfiguration(): void {
    const normalProvider = this.terrainNormalProvider;
    const pitchProvider = this.terrainPitchProvider;
    const active = this.enableTerrainPitch && (pitchProvider !== null || normalProvider !== null);
    if (
      active === this._terrainPitchActive &&
      normalProvider === this._lastTerrainNormalProvider &&
      pitchProvider === this._lastTerrainPitchProvider
    ) {
      return;
    }
    const cameraPitch = Math.asin(MathUtil.clamp(this._cameraTransform.worldForward.y, -1, 1));
    const terrainPitch = active ? this._sampleTerrainPitch(this._yaw) : null;
    this._terrainPitchActive = active;
    this._lastTerrainNormalProvider = normalProvider;
    this._lastTerrainPitchProvider = pitchProvider;
    this._terrainPitchReady = terrainPitch !== null;
    this._terrainPitch = this._targetTerrainPitch = terrainPitch ?? 0;
    this._terrainPitchVelocity = 0;
    this._pitch = this._targetPitch = cameraPitch - this._terrainPitch;
  }

  private _updateTerrainPitchTarget(moved: boolean, deltaTime: number): void {
    if (!this._terrainPitchActive) return;
    const pitchProvider = this.terrainPitchProvider;
    if (!moved && this._terrainPitchReady) return;
    const position = this._cameraTransform.worldPosition;
    let sampleX = position.x;
    let sampleZ = position.z;
    if (pitchProvider && moved) {
      const movementDistance = Math.hypot(this._planarMovementDeltaX, this._planarMovementDeltaZ);
      const elapsedTime = this._finiteNonNegative(deltaTime);
      if (movementDistance > MathUtil.zeroTolerance && elapsedTime > MathUtil.zeroTolerance) {
        const lookAheadDistance = Math.min(
          (movementDistance / elapsedTime) * this._finiteNonNegative(this.terrainPitchLookAheadTime),
          this._finiteNonNegative(this.terrainPitchLookAheadMaxDistance)
        );
        const lookAheadScale = lookAheadDistance / movementDistance;
        sampleX += this._planarMovementDeltaX * lookAheadScale;
        sampleZ += this._planarMovementDeltaZ * lookAheadScale;
      }
    }
    let terrainPitch = this._sampleTerrainPitch(this._targetYaw, sampleX, sampleZ);
    if (terrainPitch === null && (sampleX !== position.x || sampleZ !== position.z)) {
      terrainPitch = this._sampleTerrainPitch(this._targetYaw, position.x, position.z);
    }
    if (terrainPitch === null) return;
    if (!this._terrainPitchReady) {
      const cameraPitch = Math.asin(MathUtil.clamp(this._cameraTransform.worldForward.y, -1, 1));
      this._terrainPitch = this._targetTerrainPitch = terrainPitch;
      this._terrainPitchVelocity = 0;
      this._pitch = this._targetPitch = cameraPitch - terrainPitch;
      this._terrainPitchReady = true;
      return;
    }
    this._targetTerrainPitch = terrainPitch;
  }

  /** Makes explicit look input the new terrain-relative anchor without changing its visible world pitch. */
  private _rebaseTerrainPitchForManualView(
    yaw: number,
    currentCameraPitch: number,
    targetCameraPitch: number
  ): boolean {
    if (!this._terrainPitchActive) return false;
    const terrainPitch = this._sampleTerrainPitch(yaw);
    if (terrainPitch === null) {
      this._terrainPitchReady = false;
      return false;
    }
    this._terrainPitchReady = true;
    this._terrainPitch = this._targetTerrainPitch = terrainPitch;
    this._terrainPitchVelocity = 0;
    this._pitch = MathUtil.clamp(
      currentCameraPitch - terrainPitch,
      this.minPitch - terrainPitch,
      this.maxPitch - terrainPitch
    );
    this._targetPitch = MathUtil.clamp(
      targetCameraPitch - terrainPitch,
      this.minPitch - terrainPitch,
      this.maxPitch - terrainPitch
    );
    return true;
  }

  private _sampleTerrainPitch(yaw: number, worldX?: number, worldZ?: number): number | null {
    const maximumOffset = this._finiteNonNegative(this.terrainPitchMaxOffset);
    const pitchProvider = this.terrainPitchProvider;
    if (pitchProvider) {
      const position = this._cameraTransform.worldPosition;
      const pitch = pitchProvider(worldX ?? position.x, worldZ ?? position.z, yaw);
      return pitch !== null && Number.isFinite(pitch) ? MathUtil.clamp(pitch, -maximumOffset, maximumOffset) : null;
    }

    const provider = this.terrainNormalProvider;
    const normal = this._terrainNormal;
    if (!provider || !provider(normal) || normal.lengthSquared() <= MathUtil.zeroTolerance) return null;
    normal.normalize();
    if (normal.y < 0) normal.scale(-1);
    if (normal.y <= MathUtil.zeroTolerance) return null;
    const forwardX = Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rise = -(normal.x * forwardX + normal.z * forwardZ);
    return MathUtil.clamp(Math.atan2(rise, normal.y), -maximumOffset, maximumOffset);
  }

  private _applyCriticallyDampedTerrainPitch(deltaTime: number): void {
    const smoothTime = this._finiteNonNegative(this.terrainPitchSmoothTime);
    if (smoothTime <= ROTATION_EPSILON) {
      this._terrainPitch = this._targetTerrainPitch;
      this._terrainPitchVelocity = 0;
      return;
    }
    if (deltaTime <= ROTATION_EPSILON) return;

    const angularFrequency = 2 / smoothTime;
    const offset = this._terrainPitch - this._targetTerrainPitch;
    const decay = Math.exp(-angularFrequency * deltaTime);
    const integratedVelocity = (this._terrainPitchVelocity + angularFrequency * offset) * deltaTime;
    const candidate = this._targetTerrainPitch + (offset + integratedVelocity) * decay;
    const nextVelocity = (this._terrainPitchVelocity - angularFrequency * integratedVelocity) * decay;
    const maximumSpeed = this._finiteNonNegative(this.terrainPitchMaxSpeed);
    if (maximumSpeed > ROTATION_EPSILON) {
      const maximumDelta = maximumSpeed * deltaTime;
      const appliedDelta = MathUtil.clamp(candidate - this._terrainPitch, -maximumDelta, maximumDelta);
      this._terrainPitch += appliedDelta;
      this._terrainPitchVelocity =
        Math.abs(candidate - this._terrainPitch) > ROTATION_EPSILON ? appliedDelta / deltaTime : nextVelocity;
      return;
    }
    this._terrainPitch = candidate;
    this._terrainPitchVelocity = nextVelocity;
  }

  private _updateTouchAreas(width: number, height: number): void {
    if (!this.orientationTouchAreas) return;
    const landscape = width > height;
    if (landscape === this._touchLandscape) return;
    this._resetPointers();
    this._cancelPendingRotation();
    this._touchLandscape = landscape;
    if (landscape) {
      this.movementArea.set(0, 0, 0.5, 1);
      this.rotationArea.set(0.5, 0, 0.5, 1);
    } else {
      this.rotationArea.set(0, 0, 1, 0.5);
      this.movementArea.set(0, 0.5, 1, 0.5);
    }
  }

  private _releaseMovementPointer(): void {
    this._movementPointerId = -1;
    this._movementInput.set(0, 0);
    this._hideJoystick();
  }

  private _resetPointers(): void {
    this._releaseMovementPointer();
    this._releaseRotationPointer();
  }

  private _releaseRotationPointer(): void {
    this._rotationPointerId = -1;
  }

  private _cancelPendingRotation(): void {
    this._targetYaw = this._yaw;
    this._targetPitch = this._pitch;
  }

  private _showJoystick(): void {
    const bounds = this._getInputBounds();
    if (!bounds) return;
    const radius = Math.max(1, this._finiteNonNegative(this.joystickRadius));
    const knobRadius = Math.min(radius - 1, this._finiteNonNegative(this.joystickKnobRadius));
    this._joystickUi.show(this._movementOrigin.x, this._movementOrigin.y, radius, knobRadius, bounds);
  }

  private _hideJoystick(): void {
    this._joystickUi.hide();
  }

  private _setJoystickKnob(x: number, y: number): void {
    const radius = Math.max(1, this._finiteNonNegative(this.joystickRadius));
    const knobRadius = Math.min(radius - 1, this._finiteNonNegative(this.joystickKnobRadius));
    this._joystickUi.setKnob(x, y, radius, knobRadius);
  }

  private _getHtmlCanvas(): HTMLCanvasElement | null {
    if (typeof HTMLCanvasElement === "undefined") return null;
    const candidate = (this.engine.canvas as unknown as WebCanvasContainer)._webCanvas;
    return candidate instanceof HTMLCanvasElement ? candidate : null;
  }

  private _getInputBounds(): { left: number; top: number; width: number; height: number } | null {
    const canvas = this._touchSurface;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const width = bounds.width || canvas.clientWidth || this.engine.canvas.width;
    const height = bounds.height || canvas.clientHeight || this.engine.canvas.height;
    return width > 0 && height > 0 ? { left: bounds.left, top: bounds.top, width, height } : null;
  }

  private _screenToClientPosition(screenX: number, screenY: number): Vector2 | null {
    const bounds = this._getInputBounds();
    const { width, height } = this.engine.canvas;
    if (!bounds || width <= 0 || height <= 0 || !Number.isFinite(screenX) || !Number.isFinite(screenY)) return null;
    return this._pointerCssPosition.set(
      bounds.left + (screenX / width) * bounds.width,
      bounds.top + (screenY / height) * bounds.height
    );
  }

  private _acquireTouchSurface(): void {
    const canvas = this._getHtmlCanvas();
    if (!canvas || this._touchSurface === canvas) return;
    this._releaseTouchSurface();
    const ownership = FreeControl._touchSurfaces.get(canvas);
    if (ownership) {
      ownership.ownerCount++;
    } else {
      FreeControl._touchSurfaces.set(canvas, {
        ownerCount: 1,
        previousTouchAction: canvas.style.touchAction,
        previousTapHighlightColor: canvas.style.getPropertyValue("-webkit-tap-highlight-color")
      });
      canvas.style.touchAction = "none";
      canvas.style.setProperty("-webkit-tap-highlight-color", "transparent");
    }
    this._touchSurface = canvas;
  }

  private _releaseTouchSurface(): void {
    const canvas = this._touchSurface;
    if (!canvas) return;
    const ownership = FreeControl._touchSurfaces.get(canvas);
    if (ownership) {
      ownership.ownerCount--;
      if (ownership.ownerCount <= 0) {
        canvas.style.touchAction = ownership.previousTouchAction;
        canvas.style.setProperty("-webkit-tap-highlight-color", ownership.previousTapHighlightColor);
        FreeControl._touchSurfaces.delete(canvas);
      }
    }
    this._touchSurface = null;
  }

  private _contains(rect: Rect, x: number, y: number): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  private _finiteNonNegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
}
