import { Camera } from "./Camera";
import { Component } from "./Component";
import { ignoreClone } from "./clone/CloneDecorators";
import { PointerEventData } from "./input/pointer/PointerEventData";
import { Collider } from "./physics";
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
  _entityScriptsIndex: number = -1;

  @ignoreClone
  private _hasContactEvents = false;

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
   * Called when a trigger overlap begins.
   * @param other - The collider on the other side of the overlap
   * @param self - The receiving collider on this entity or owned by its Rigidbody
   */
  onTriggerEnter(other: Collider, self: Collider): void {}

  /**
   * Called when a trigger overlap ends.
   * @param other - The collider on the other side of the overlap
   * @param self - The receiving collider on this entity or owned by its Rigidbody
   */
  onTriggerExit(other: Collider, self: Collider): void {}

  /**
   * Called on subsequent physics steps while a trigger overlap continues.
   * @param other - The collider on the other side of the overlap
   * @param self - The receiving collider on this entity or owned by its Rigidbody
   */
  onTriggerStay(other: Collider, self: Collider): void {}

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
   * Called when a pointer press is dispatched to this entity.
   * @param eventData - The pointer event data that triggered this callback
   */
  onPointerDown(eventData: PointerEventData): void {}

  /**
   * Called when a pointer release is dispatched to this entity.
   * @param eventData - The pointer event data that triggered this callback
   */
  onPointerUp(eventData: PointerEventData): void {}

  /**
   * Called when this entity receives both the pointer press and release for a click.
   * @param eventData - The pointer event data that triggered this callback
   */
  onPointerClick(eventData: PointerEventData): void {}

  /**
   * Called when this entity joins the pointer's hit path.
   * @param eventData - The pointer event data that triggered this callback
   */
  onPointerEnter(eventData: PointerEventData): void {}

  /**
   * Called when this entity leaves the pointer's hit path.
   * @param eventData - The pointer event data that triggered this callback
   */
  onPointerExit(eventData: PointerEventData): void {}

  /**
   * This function will be called when the pointer is pressed on the collider.
   * @param eventData - The pointer event data that triggered this callback
   */
  onPointerBeginDrag(eventData: PointerEventData): void {}

  /**
   *  When a drag collision occurs on the pointer, this function will be called every time it moves.
   * @param eventData - The pointer event data that triggered this callback
   */
  onPointerDrag(eventData: PointerEventData): void {}

  /**
   *  When dragging ends, this function will be called (Dragged object).
   * @param eventData - The pointer event data that triggered this callback
   */
  onPointerEndDrag(eventData: PointerEventData): void {}

  /**
   *  When dragging ends, this function will be called (Receiving object).
   * @param eventData - The pointer event data that triggered this callback
   */
  onPointerDrop(eventData: PointerEventData): void {}

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
    if (this.destroyed) return;
    const { _componentsManager: componentsManager } = this.scene!;
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

    for (let i = 0; i < pointerMethods.length; i++) {
      const pointerMethod = pointerMethods[i];
      if (this[pointerMethod] === prototype[pointerMethod]) {
        this[pointerMethod] = null!;
      }
    }

    this._entity._addScript(this);
    if (
      this.onCollisionEnter !== prototype.onCollisionEnter ||
      this.onCollisionExit !== prototype.onCollisionExit ||
      this.onCollisionStay !== prototype.onCollisionStay
    ) {
      this._hasContactEvents = true;
      this.scene!.physics._addContactEventConsumer(1);
    }
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    if (this._entityScriptsIndex === -1) return;
    const componentsManager = this.scene!._componentsManager;
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
    if (this._hasContactEvents) {
      this._hasContactEvents = false;
      this.scene!.physics._addContactEventConsumer(-1);
    }
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this.onDestroy();
  }
}

const pointerMethods = [
  "onPointerDown",
  "onPointerUp",
  "onPointerClick",
  "onPointerEnter",
  "onPointerExit",
  "onPointerBeginDrag",
  "onPointerDrag",
  "onPointerEndDrag",
  "onPointerDrop"
] as const;
