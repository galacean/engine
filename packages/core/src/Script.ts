import { Camera } from "./Camera";
import { ignoreClone } from "./clone/CloneManager";
import { Component } from "./Component";
import { ACollider } from "./collider";
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
  _onPreRenderIndex: number = -1;
  /** @internal */
  @ignoreClone
  _onPostRenderIndex: number = -1;
  @ignoreClone
  _entityCacheIndex: number = -1;

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
   * Called when the collision enter.
   * @param other Collider
   */
  onTriggerEnter(other: ACollider): void {}

  /**
   * Called when the collision stay.
   * @remarks onTriggerStay is called every frame while the collision stay.
   * @param other Collider
   */
  onTriggerStay(other: ACollider): void {}

  /**
   * Called when the collision exit.
   * @param other Collider
   */
  onTriggerExit(other: ACollider): void {}

  /**
   * Called when the pointer is down while over the Collider.
   */
  onPointerDown(): void {}

  /**
   * Called when the pointer is up while over the Collider.
   */
  onPointerUp(): void {}

  /**
   * Called when the pointer is down and up with the same collider.
   */
  onPointerClick(): void {}

  /**
   * Called when the pointer is enters the Collider.
   */
  onPointerEnter(): void {}

  /**
   * Called when the pointer is no longer over the Collider.
   */
  onPointerExit(): void {}

  /**
   * Called when the pointer is down while over the Collider and is still holding down.
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
    const componentsManager = this.engine._componentsManager;
    const prototype = Script.prototype;
    if (!this._started) {
      componentsManager.addOnStartScript(this);
    }
    if (this.onUpdate !== prototype.onUpdate) {
      componentsManager.addOnUpdateScript(this);
    }
    if (this.onLateUpdate !== prototype.onLateUpdate) {
      componentsManager.addOnLateUpdateScript(this);
    }
    this._entity._addScript(this);
    this.onEnable();
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onDisable(): void {
    const componentsManager = this.engine._componentsManager;
    // Use "xxIndex" is more safe.
    // When call onDisable it maybe it still not in script queue,for example write "entity.isActive = false" in onWake().
    if (this._onStartIndex !== -1) {
      componentsManager.removeOnStartScript(this);
    }
    if (this._onUpdateIndex !== -1) {
      componentsManager.removeOnUpdateScript(this);
    }
    if (this._onLateUpdateIndex !== -1) {
      componentsManager.removeOnLateUpdateScript(this);
    }
    if (this._entityCacheIndex !== -1) {
      this._entity._removeScript(this);
    }
    this.onDisable();
  }

  /**
   * @internal
   * @inheritDoc
   * @override
   */
  _onDestroy(): void {
    this.engine._componentsManager.addDestoryComponent(this);
  }
}
