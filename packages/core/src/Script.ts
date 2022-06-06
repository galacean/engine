import { Camera } from "./Camera";
import { ignoreClone } from "./clone/CloneManager";
import { Component } from "./Component";
import { ColliderShape } from "./physics";

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
  @ignoreClone
  _entityScriptsIndex: number = -1;
  @ignoreClone
  _waitHandlingInValid: boolean = false;

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
   * @param deltaTime - The deltaTime when the script update.
   */
  onUpdate(deltaTime: number): void {}

  /**
   * Called after the onUpdate finished, called frame by frame.
   * @param deltaTime - The deltaTime when the script update.
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
   * Called when the collision enter.
   * @param other - ColliderShape
   */
  onTriggerEnter(other: ColliderShape): void {}

  /**
   * Called when the collision stay.
   * @remarks onTriggerStay is called every frame while the collision stay.
   * @param other - ColliderShape
   */
  onTriggerExit(other: ColliderShape): void {}

  /**
   * Called when the collision exit.
   * @param other - ColliderShape
   */
  onTriggerStay(other: ColliderShape): void {}

  /**
   * Called when the collision enter.
   * @param other - ColliderShape
   */
  onCollisionEnter(other: ColliderShape): void {}

  /**
   * Called when the collision stay.
   * @remarks onTriggerStay is called every frame while the collision stay.
   * @param other - ColliderShape
   */
  onCollisionExit(other: ColliderShape): void {}

  /**
   * Called when the collision exit.
   * @param other - ColliderShape
   */
  onCollisionStay(other: ColliderShape): void {}

  /**
   * Called when the pointer is down while over the ColliderShape.
   */
  onPointerDown(): void {}

  /**
   * Called when the pointer is up while over the ColliderShape.
   */
  onPointerUp(): void {}

  /**
   * Called when the pointer is down and up with the same collider.
   */
  onPointerClick(): void {}

  /**
   * Called when the pointer is enters the ColliderShape.
   */
  onPointerEnter(): void {}

  /**
   * Called when the pointer is no longer over the ColliderShape.
   */
  onPointerExit(): void {}

  /**
   * Called when the pointer is down while over the ColliderShape and is still holding down.
   * @remarks onPointerDrag is called every frame while the pointer is down.
   */
  onPointerDrag(): void {}

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
   * @inheritDoc
   * @override
   */
  _onAwake(): void {
    this.onAwake();
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onEnable(): void {
    if (this._waitHandlingInValid) {
      this._waitHandlingInValid = false;
    } else {
      const { _componentsManager: componentsManager } = this.engine;
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
      this._entity._addScript(this);
    }

    this.onEnable();
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onDisable(): void {
    this._waitHandlingInValid = true;
    this._engine._componentsManager.addDisableScript(this);
    this.onDisable();
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onDestroy(): void {
    this._engine._componentsManager.addDestroyScript(this);
  }

  /**
   * @internal
   */
  _handlingInValid(): void {
    const componentsManager = this.engine._componentsManager;
    // Use "xxIndex !== -1" to project.
    // Maybe call onDisable it is still not in script queue, for example write "entity.isActive = false" in onWake().
    if (this._onUpdateIndex !== -1) {
      componentsManager.removeOnUpdateScript(this);
    }
    if (this._onLateUpdateIndex !== -1) {
      componentsManager.removeOnLateUpdateScript(this);
    }
    if (this._onPhysicsUpdateIndex !== -1) {
      componentsManager.removeOnPhysicsUpdateScript(this);
    }
    if (this._entityScriptsIndex !== -1) {
      this._entity._removeScript(this);
    }
    this._waitHandlingInValid = false;
  }
}
