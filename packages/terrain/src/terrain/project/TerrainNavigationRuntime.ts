import { MathUtil, type Vector3 } from "@galacean/engine";
import { FreeControl } from "@galacean/engine-animals/controls/FreeControl";

export type TerrainNavigationInputMode = "joystick" | "keyboard";

const TERRAIN_NAVIGATION_LOOK_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
const TERRAIN_NAVIGATION_KEY_CODES = new Set([
  ...TERRAIN_NAVIGATION_LOOK_KEYS,
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "ShiftRight"
]);
const TERRAIN_NAVIGATION_NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit"
]);

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  return target instanceof HTMLInputElement && !TERRAIN_NAVIGATION_NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase());
}

/** Unlike WASD, arrows also belong to native sliders, radios and other input controls. */
function isArrowControlTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || isEditableKeyboardTarget(target);
}

/** Continuous world-space support surface used by terrain navigation. */
export interface TerrainNavigationGroundProvider {
  /**
   * Samples the traversable floor height at one world-space position.
   * Providers may compose Terrain with stable Water or other gameplay support surfaces.
   * @param worldX World-space X coordinate in metres.
   * @param worldZ World-space Z coordinate in metres.
   * @returns Ground height, or `undefined` when no loaded Region covers the position.
   */
  sampleHeightInterpolated(worldX: number, worldZ: number): number | undefined;
  /**
   * Samples a normalized support normal without allocating when the provider already owns one.
   * Height-only providers fall back to finite differences around the committed contact point.
   */
  sampleNormalInterpolated?(worldX: number, worldZ: number, outNormal: Vector3): boolean;
}

/** Optional movement owner reusing navigation keyboard and joystick input. */
export interface TerrainNavigationLocomotionOwner {
  /** Consume normalized movement input once per frame while navigation retains pointer look. */
  applyInput(right: number, forward: number, sprint: boolean, deltaTime: number): void;
  /** Suspend a default grounded controller when an explicit movement owner or flight takes over. */
  setActive?(active: boolean): void;
}

/** Terrain grounding layered on the shared World Engine mobile FreeControl. */
export class TerrainNavigationRuntime extends FreeControl {
  /** Authored movement speed for terrain-scale worlds. */
  override movementSpeed = 30;

  /** Temporarily delegates movement and support positioning to another locomotion system. */
  locomotionOwner: TerrainNavigationLocomotionOwner | null = null;
  /** Optional walking collision adapter; riding/debug owners retain priority. */
  groundedLocomotionOwner: TerrainNavigationLocomotionOwner | null = null;
  private _delegatedRight = 0;
  private _delegatedForward = 0;

  /** Terrain navigation follows sampled height instead of a flat floor. */
  override floorMock = false;

  /** Terrain roaming keeps the authored camera pitch unless slope tracking is explicitly enabled. */
  override enableTerrainPitch = false;

  /** Caps automatic slope compensation at 30 degrees. */
  override terrainPitchMaxOffset = Math.PI / 6;

  /** A four-metre half-baseline filters interpolated mesh and Region-boundary slope noise. */
  terrainPitchSampleDistance = 4;

  /** Spatially fits the terrain slope around the committed camera position. */
  override terrainPitchProvider = (worldX: number, worldZ: number, yaw: number): number | null =>
    this.getTerrainReferencePitch(worldX, worldZ, yaw);

  /** Predicts the slope target by the same horizon used by the camera response. */
  override terrainPitchLookAheadTime = 0.18;

  /** Prevents high movement speeds from sampling outside the local terrain neighbourhood. */
  override terrainPitchLookAheadMaxDistance = 8;

  /** Critically damped response time for terrain-only camera motion. */
  override terrainPitchSmoothTime = 0.18;

  /** Caps automatic pitch motion at 90 degrees per second. */
  override terrainPitchMaxSpeed = Math.PI / 2;

  /** Camera height above sampled terrain while ground collision is active. */
  eyeHeight = 3;

  /** Hosts with a fixed player clearance disable Q/E flight and restored flight offsets. */
  verticalMovementEnabled = true;

  /** Publishes the effective camera clearance after Q/E or an explicit navigation update. */
  onGroundClearanceChanged: ((height: number) => void) | undefined;

  /** Whether loaded terrain heights constrain the navigation camera. */
  groundCollision = false;

  /** Active movement owner. Pointer rotation remains available in both modes. */
  get inputMode(): TerrainNavigationInputMode {
    return this._inputMode;
  }

  /** Accepted grounded travel from movement input, after support collision; excludes camera authoring. */
  onGroundedTravel: ((distanceMetres: number) => void) | undefined;
  private readonly _travelStart = { x: 0, z: 0 };
  private _hasTravelStart = false;

  override applyPlanarMovementInput(right: number, forward: number, deltaTime: number): void {
    if (this._movementOwner()) {
      this._delegatedRight = right;
      this._delegatedForward = forward;
      return;
    }
    if (!this._hasTravelStart) {
      const p = this.entity.transform.worldPosition;
      this._travelStart.x = p.x;
      this._travelStart.z = p.z;
      this._hasTravelStart = true;
    }
    super.applyPlanarMovementInput(right, forward, deltaTime);
  }

  private _groundProvider: TerrainNavigationGroundProvider | null = null;
  private _hasGroundedPosition = false;
  private readonly _lastGroundedPosition = this.entity.transform.worldPosition.clone();
  private _verticalOffset = 0;
  private _inputMode: TerrainNavigationInputMode = "joystick";
  private readonly _pressedKeys = new Set<string>();
  private _keyboardEventsAttached = false;

  private readonly _handleKeyDown = (event: KeyboardEvent): void => {
    if (
      this._inputMode !== "keyboard" ||
      !this.inputEnabled ||
      !TERRAIN_NAVIGATION_KEY_CODES.has(event.code) ||
      isEditableKeyboardTarget(event.target)
    ) {
      return;
    }
    if (
      TERRAIN_NAVIGATION_LOOK_KEYS.has(event.code) &&
      (!this.rotationEnabled ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isArrowControlTarget(event.target))
    )
      return;
    this._pressedKeys.add(event.code);
    event.preventDefault();
  };

  private readonly _handleKeyUp = (event: KeyboardEvent): void => {
    if (!TERRAIN_NAVIGATION_KEY_CODES.has(event.code)) return;
    this._pressedKeys.delete(event.code);
    if (
      TERRAIN_NAVIGATION_LOOK_KEYS.has(event.code) &&
      (!this.inputEnabled ||
        !this.rotationEnabled ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isArrowControlTarget(event.target))
    )
      return;
    if (this._inputMode === "keyboard" && !isEditableKeyboardTarget(event.target)) event.preventDefault();
  };

  private readonly _handleKeyboardFocus = (event: FocusEvent): void => {
    if (isArrowControlTarget(event.target)) {
      for (const key of TERRAIN_NAVIGATION_LOOK_KEYS) this._pressedKeys.delete(key);
    }
  };

  private readonly _clearPressedKeys = (): void => {
    this._pressedKeys.clear();
  };

  override onAwake(): void {
    super.onAwake();
    this._attachKeyboardEvents();
  }

  override onEnable(): void {
    super.onEnable();
    this._attachKeyboardEvents();
  }

  override onDisable(): void {
    this._detachKeyboardEvents();
    super.onDisable();
  }

  override onDestroy(): void {
    this._detachKeyboardEvents();
    super.onDestroy();
  }

  override setInputEnabled(enabled: boolean): void {
    super.setInputEnabled(enabled);
    if (!enabled) this._clearPressedKeys();
  }

  /** Switches movement ownership without changing camera pose, pointer-look rotation, or terrain-pitch policy. */
  setInputMode(mode: TerrainNavigationInputMode): void {
    if (mode !== "joystick" && mode !== "keyboard") {
      throw new RangeError(`Unknown terrain navigation input mode '${String(mode)}'.`);
    }
    this._inputMode = mode;
    this.movementGestureEnabled = mode === "joystick";
    this._clearPressedKeys();
  }

  /** Additional grounded flight height above {@link eyeHeight}. */
  get verticalOffset(): number {
    return this._verticalOffset;
  }

  /** Effective camera clearance above the sampled support surface. */
  get groundClearance(): number {
    return this.eyeHeight + this._verticalOffset;
  }

  /** Restores the additional grounded flight height used by camera bookmarks and external navigation tools. */
  setVerticalOffset(offset: number): void {
    if (!Number.isFinite(offset) || offset < 0) {
      throw new RangeError("Terrain navigation vertical offset must be finite and non-negative");
    }
    this._verticalOffset = !this.verticalMovementEnabled || offset <= Number.EPSILON * 16 ? 0 : offset;
    if (this.groundCollision) this.snapToGround();
    this._publishGroundClearance();
  }

  /** Applies Q/E-style vertical movement while retaining terrain as the minimum floor. */
  applyVerticalMovementInput(vertical: number, deltaTime: number): void {
    if (
      !this.verticalMovementEnabled ||
      this.locomotionOwner ||
      !this.movementEnabled ||
      !Number.isFinite(vertical) ||
      Math.abs(vertical) <= Number.EPSILON
    )
      return;
    const safeDeltaTime = Math.min(
      Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0,
      Number.isFinite(this.maxMovementDeltaTime) ? Math.max(0, this.maxMovementDeltaTime) : 0
    );
    const speed = Number.isFinite(this.movementSpeed) ? Math.max(0, this.movementSpeed) : 0;
    if (safeDeltaTime === 0 || speed === 0) return;
    const distance = Math.max(-1, Math.min(1, vertical)) * speed * safeDeltaTime;
    if (this.groundCollision) {
      this._verticalOffset = Math.max(0, this._verticalOffset + distance);
      this._publishGroundClearance();
      return;
    }
    const position = this.entity.transform.worldPosition;
    this.entity.transform.setWorldPosition(position.x, position.y + distance, position.z);
  }

  private _publishedViewPending = false;

  /** Switch support references during scene publication; sampling waits until the next frame. */
  publishGroundProvider(provider: TerrainNavigationGroundProvider | null): void {
    this._groundProvider = provider;
    this._hasGroundedPosition = false;
    this._publishedViewPending = true;
  }

  /** Reversible pointer publication; rollback does not re-enter a host publish callback. */
  prepareGroundProvider(provider: TerrainNavigationGroundProvider | null) {
    const previous = {
      provider: this._groundProvider,
      grounded: this._hasGroundedPosition,
      pending: this._publishedViewPending
    };
    return {
      commit: () => this.publishGroundProvider(provider),
      rollback: () => {
        this._groundProvider = previous.provider;
        this._hasGroundedPosition = previous.grounded;
        this._publishedViewPending = previous.pending;
      }
    };
  }

  override onLateUpdate(deltaTime: number): void {
    if (this._publishedViewPending) {
      this._publishedViewPending = false;
      this.synchronizeView();
    }
    super.onLateUpdate(deltaTime);
  }

  /** Connects navigation to the loaded canonical height fields. */
  setGroundProvider(provider: TerrainNavigationGroundProvider | null): void {
    this._groundProvider = provider;
    this._hasGroundedPosition = false;
    if (provider && this.groundCollision) this.snapToGround();
    this.synchronizeView();
  }

  /** Resolves the local forward slope from a centered world-space height baseline. */
  getTerrainReferencePitch(worldX: number, worldZ: number, yaw: number): number | null {
    const provider = this._groundProvider;
    if (!provider || !this.groundCollision || !this._hasGroundedPosition) return null;
    const sampleDistance = Number.isFinite(this.terrainPitchSampleDistance)
      ? Math.max(MathUtil.zeroTolerance, this.terrainPitchSampleDistance)
      : 0;
    if (sampleDistance <= MathUtil.zeroTolerance) return null;
    const forwardX = Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const center = provider.sampleHeightInterpolated(worldX, worldZ);
    if (center === undefined || !Number.isFinite(center)) return null;
    const slope = resolveGroundSlope(
      provider.sampleHeightInterpolated(worldX - forwardX * sampleDistance, worldZ - forwardZ * sampleDistance),
      center,
      provider.sampleHeightInterpolated(worldX + forwardX * sampleDistance, worldZ + forwardZ * sampleDistance),
      sampleDistance
    );
    return slope === null ? null : Math.atan(slope);
  }

  /** Enables or disables terrain contact without changing camera orientation. */
  setGroundCollision(enabled: boolean): void {
    this.groundCollision = enabled;
    this._verticalOffset = 0;
    if (enabled) this.snapToGround();
    this.synchronizeView();
    this._publishGroundClearance();
  }

  /** Updates camera clearance above terrain and immediately reapplies contact. */
  setEyeHeight(height: number): void {
    if (!Number.isFinite(height) || height <= 0) {
      throw new RangeError("Terrain navigation eye height must be finite and positive");
    }
    this.eyeHeight = height;
    if (this.groundCollision) this.snapToGround();
    this._publishGroundClearance();
  }

  /** Resolves the current camera XZ position against the connected height source. */
  snapToGround(): number | undefined {
    const provider = this._groundProvider;
    if (!provider || this._movementOwner()) return undefined;
    const transform = this.entity.transform;
    const position = transform.worldPosition;
    const groundHeight = provider.sampleHeightInterpolated(position.x, position.z);
    if (groundHeight === undefined || !Number.isFinite(groundHeight)) {
      if (this._hasGroundedPosition) {
        transform.setWorldPosition(
          this._lastGroundedPosition.x,
          this._lastGroundedPosition.y,
          this._lastGroundedPosition.z
        );
      }
      return undefined;
    }
    const cameraY = groundHeight + this.eyeHeight + this._verticalOffset;
    transform.setWorldPosition(position.x, cameraY, position.z);
    this._lastGroundedPosition.set(position.x, cameraY, position.z);
    this._hasGroundedPosition = true;
    return groundHeight;
  }

  protected override onBeforeViewUpdate(deltaTime: number): void {
    if (this._inputMode === "keyboard" && this.inputEnabled) {
      const right = Number(this._pressedKeys.has("KeyD")) - Number(this._pressedKeys.has("KeyA"));
      const forward = Number(this._pressedKeys.has("KeyW")) - Number(this._pressedKeys.has("KeyS"));
      const vertical = Number(this._pressedKeys.has("KeyE")) - Number(this._pressedKeys.has("KeyQ"));
      if (right !== 0 || forward !== 0) this.applyPlanarMovementInput(right, forward, deltaTime);
      if (vertical !== 0) this.applyVerticalMovementInput(vertical, deltaTime);
      const yaw = Number(this._pressedKeys.has("ArrowRight")) - Number(this._pressedKeys.has("ArrowLeft"));
      const pitch = Number(this._pressedKeys.has("ArrowUp")) - Number(this._pressedKeys.has("ArrowDown"));
      if (yaw !== 0 || pitch !== 0) {
        const dt = Math.min(
          Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0,
          Number.isFinite(this.maxMovementDeltaTime) ? Math.max(0, this.maxMovementDeltaTime) : 0
        );
        const sensitivity = Number.isFinite(this.rotationSensitivity) ? Math.max(0, this.rotationSensitivity) : 0;
        const angle = (Math.PI / 2) * sensitivity * dt;
        this.applyViewRotationInput(yaw * angle, pitch * angle);
      }
    }
    const owner = this._movementOwner();
    this.groundedLocomotionOwner?.setActive?.(owner === this.groundedLocomotionOwner);
    if (owner) {
      const accepting = this.inputEnabled && this.movementEnabled;
      owner.applyInput(
        accepting ? this._delegatedRight : 0,
        accepting ? this._delegatedForward : 0,
        accepting && (this._pressedKeys.has("ShiftLeft") || this._pressedKeys.has("ShiftRight")),
        deltaTime
      );
      this._delegatedRight = this._delegatedForward = 0;
    } else if (this.groundCollision) this.snapToGround();
    const start = this._travelStart;
    const hasTravelStart = this._hasTravelStart;
    this._hasTravelStart = false;
    if (hasTravelStart && this.groundCollision && this._hasGroundedPosition && this._verticalOffset === 0) {
      const p = this.entity.transform.worldPosition;
      const distance = Math.hypot(p.x - start.x, p.z - start.z);
      if (distance > 0) this.onGroundedTravel?.(distance);
    }
  }

  private _attachKeyboardEvents(): void {
    if (
      this._keyboardEventsAttached ||
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    ) {
      return;
    }
    this._keyboardEventsAttached = true;
    window.addEventListener("keydown", this._handleKeyDown);
    window.addEventListener("keyup", this._handleKeyUp);
    window.addEventListener("blur", this._clearPressedKeys);
    window.addEventListener("focusin", this._handleKeyboardFocus);
  }

  private _movementOwner(): TerrainNavigationLocomotionOwner | null {
    return (
      this.locomotionOwner ??
      (this.groundCollision && !this.verticalMovementEnabled ? this.groundedLocomotionOwner : null)
    );
  }

  private _detachKeyboardEvents(): void {
    if (!this._keyboardEventsAttached || typeof window === "undefined") return;
    this._keyboardEventsAttached = false;
    window.removeEventListener("keydown", this._handleKeyDown);
    window.removeEventListener("keyup", this._handleKeyUp);
    window.removeEventListener("blur", this._clearPressedKeys);
    window.removeEventListener("focusin", this._handleKeyboardFocus);
    this._clearPressedKeys();
    this._hasTravelStart = false;
  }

  private _publishGroundClearance(): void {
    this.onGroundClearanceChanged?.(this.groundClearance);
  }
}

function resolveGroundSlope(
  negativeSample: number | undefined,
  centerSample: number,
  positiveSample: number | undefined,
  sampleDistance: number
): number | null {
  const hasNegative = negativeSample !== undefined && Number.isFinite(negativeSample);
  const hasPositive = positiveSample !== undefined && Number.isFinite(positiveSample);
  if (hasNegative && hasPositive) return (positiveSample! - negativeSample!) / (sampleDistance * 2);
  if (hasPositive) return (positiveSample! - centerSample) / sampleDistance;
  if (hasNegative) return (centerSample - negativeSample!) / sampleDistance;
  return null;
}
