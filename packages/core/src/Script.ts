import { Camera } from "./Camera";
import { ignoreClone } from "./clone/CloneManager";
import { Component } from "./Component";
import { Pointer } from "./input";
import { PointerEventData } from "./input/pointer/PointerEventData";
import { PointerEventType } from "./input/pointer/PointerEventType";
import { ColliderShape } from "./physics";
import { Collision } from "./physics/Collision";

/**
 * Script class, used for logic writing.
 */
export class Script extends Component {
  /** @internal */
  @ignoreClone
  _started: boolean = false;
  /** @internal */
  @ignoreClone
  _onStartIndex: number = -1;
  /** @internal */
  @ignoreClone
  _onUpdateIndex: number = -1;
  /** @internal */
  @ignoreClone
  _onLateUpdateIndex: number = -1;
  /** @internal */
  @ignoreClone
  _onPhysicsUpdateIndex: number = -1;
  /** @internal */
  @ignoreClone
  _onPreRenderIndex: number = -1;
  /** @internal */
  @ignoreClone
  _onPostRenderIndex: number = -1;
  /** @internal */
  @ignoreClone
  _onPointerEventIndexArray: number[] = [];
  /** @internal */
  @ignoreClone
  _entityScriptsIndex: number = -1;

  /**
   * Called when be enabled first time, only once.
   */
  onAwake(): void {}

  /**
   * Called when be enabled.
   */
  onEnable(): void {}

  /**
   * Called before the frame-level loop start for the first time, only once.
   */
  onStart(): void {}

  /**
   * The main loop, called frame by frame.
   * @param deltaTime - The delta time since last frame in seconds
   */
  onUpdate(deltaTime: number): void {}

  /**
   * Called after the onUpdate finished, called frame by frame.
   * @param deltaTime - The delta time since last frame in seconds
   */
  onLateUpdate(deltaTime: number): void {}

  /**
   * Called before camera rendering, called per camera.
   * @param camera - Current camera.
   */
  onBeginRender(camera: Camera): void {}

  /**
   * Called after camera rendering, called per camera.
   * @param camera - Current camera.
   */
  onEndRender(camera: Camera): void {}

  /**
   * Called before physics calculations, the number of times is related to the physical update frequency.
   */
  onPhysicsUpdate(): void {}

  /**
   * Called when the trigger enter.
   * @param other - ColliderShape
   */
  onTriggerEnter(other: ColliderShape): void {}

  /**
   * Called when the trigger exit.
   * @param other - ColliderShape
   */
  onTriggerExit(other: ColliderShape): void {}

  /**
   * Called when the trigger stay.
   * @remarks onTriggerStay is called every frame while the trigger stay.
   * @param other - ColliderShape
   */
  onTriggerStay(other: ColliderShape): void {}

  /**
   * Called when the collision enter.
   * @param other - The Collision data associated with this collision event
   * @remarks The Collision data will be invalid after this call, you should copy the data if needed.
   */
  onCollisionEnter(other: Collision): void {}

  /**
   * Called when the collision exit.
   * @param other - The Collision data associated with this collision event
   * @remarks The Collision data will be invalid after this call, you should copy the data if needed.
   */
  onCollisionExit(other: Collision): void {}

  /**
   * Called when the collision stay.
   * @param other - The Collision data associated with this collision event
   * @remarks The Collision data will be invalid after this call, you should copy the data if needed.
   */
  onCollisionStay(other: Collision): void {}

  /**
   * Called when the pointer is down while over the ColliderShape.
   * @param pointer - The pointer that triggered
   */
  onPointerDown(event: Pointer): void {}

  /**
   * Called when the pointer is up while over the ColliderShape.
   * @param pointer - The pointer that triggered
   */
  onPointerUp(event: Pointer): void {}

  /**
   * Called when the pointer is down and up with the same collider.
   * @param pointer - The pointer that triggered
   */
  onPointerClick(event: Pointer): void {}

  /**
   * Called when the pointer is enters the ColliderShape.
   * @param pointer - The pointer that triggered
   */
  onPointerEnter(event: Pointer): void {}

  /**
   * Called when the pointer is no longer over the ColliderShape.
   * @param pointer - The pointer that triggered
   */
  onPointerExit(event: Pointer): void {}

  /**
   * Called when the pointer is down while over the ColliderShape and is still holding down.
   * @param pointer - The pointer that triggered
   * @remarks onPointerDrag is called every frame while the pointer is down.
   */
  onPointerDrag(pointer: Pointer): void {}

  /**
   * Called when be disabled.
   */
  onDisable(): void {}

  /**
   * Called at the end of the destroyed frame.
   */
  onDestroy(): void {}

  /**
   * @internal
   */
  override _onAwake(): void {
    this.onAwake();
  }

  /**
   * @internal
   */
  override _onEnable(): void {
    this.onEnable();
  }

  /**
   * @internal
   */
  override _onDisable(): void {
    this.onDisable();
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    const { _componentsManager: componentsManager } = this.scene;
    const { prototype } = Script;
    if (!this._started) {
      componentsManager.addOnStartScript(this);
    }
    if (this.onUpdate !== prototype.onUpdate) {
      componentsManager.addOnUpdateScript(this);
    }
    if (this.onLateUpdate !== prototype.onLateUpdate) {
      componentsManager.addOnLateUpdateScript(this);
    }
    if (this.onPhysicsUpdate !== prototype.onPhysicsUpdate) {
      componentsManager.addOnPhysicsUpdateScript(this);
    }
    const { _entity: entity } = this;
    if (this.onPointerDown !== prototype.onPointerDown) {
      entity._addOnPointerEvent(PointerEventType.Down, this, this.onPointerDown);
    }
    if (this.onPointerUp !== prototype.onPointerUp) {
      entity._addOnPointerEvent(PointerEventType.Up, this, this.onPointerUp);
    }
    if (this.onPointerClick !== prototype.onPointerClick) {
      entity._addOnPointerEvent(PointerEventType.Click, this, this.onPointerClick);
    }
    if (this.onPointerEnter !== prototype.onPointerEnter) {
      entity._addOnPointerEvent(PointerEventType.Enter, this, this.onPointerEnter);
    }
    if (this.onPointerExit !== prototype.onPointerExit) {
      entity._addOnPointerEvent(PointerEventType.Exit, this, this.onPointerExit);
    }
    entity._addScript(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    const componentsManager = this.scene._componentsManager;
    const { prototype } = Script;

    if (!this._started) {
      componentsManager.removeOnStartScript(this);
    }
    if (this.onUpdate !== prototype.onUpdate) {
      componentsManager.removeOnUpdateScript(this);
    }
    if (this.onLateUpdate !== prototype.onLateUpdate) {
      componentsManager.removeOnLateUpdateScript(this);
    }
    if (this.onPhysicsUpdate !== prototype.onPhysicsUpdate) {
      componentsManager.removeOnPhysicsUpdateScript(this);
    }

    this._entity._removeScript(this);
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    if (this.scene) {
      this.scene._componentsManager.addPendingDestroyScript(this);
    } else {
      this.onDestroy();
    }
  }
}
