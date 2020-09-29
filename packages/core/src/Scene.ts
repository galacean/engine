import { Vector3, Vector4 } from "@alipay/o3-math";
import { EventDispatcher, Logger, MaskList } from "./base";
import { Camera } from "./Camera";
import { Engine } from "./Engine";
import { Entity } from "./Entity";
import { FeatureManager } from "./FeatureManager";
import { SceneFeature } from "./SceneFeature";

/**
 * 场景。
 */
export class Scene extends EventDispatcher {
  static sceneFeatureManager = new FeatureManager<SceneFeature>();

  /** 场景名字 */
  name: string;
  /**
   * @private
   * @deprecated
   * @todo: migrate to camera
   * 裁剪面，平面方程组。裁剪面以下的片元将被剔除绘制
   * @example
   * scene.clipPlanes = [[0,1,0,0]];
   * */
  clipPlanes: Vector4[] = [];
  _activeCameras: Camera[] = [];
  _isActiveInEngine: boolean = false;

  private _engine: Engine;
  private _destroyed: boolean = false;
  private _rootEntities: Entity[] = [];

  /**
   * 当前的所属 Engine。
   */
  get engine(): Engine {
    return this._engine;
  }

  /**
   * 根实体的数量。
   */
  get rootEntitiesCount(): number {
    return this._rootEntities.length;
  }

  /**
   * 根实体集合。
   */
  get rootEntities(): Readonly<Entity[]> {
    return this._rootEntities;
  }

  /**
   * 是否已销毁。
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * @param name - 名称
   * @param engine - 引擎
   */
  constructor(name?: string, engine?: Engine) {
    super();
    this.name = name || "";
    this._engine = engine || Engine._getDefaultEngine();

    Scene.sceneFeatureManager.addObject(this);
  }

  /**
   * 创建根实体。
   * @param name - 实体名称
   * @returns 实体
   */
  createRootEntity(name?: string): Entity {
    const entity = new Entity(name, this._engine);
    this.addRootEntity(entity);
    return entity;
  }

  /**
   * 添加根实体。
   * @param entity - 根实体
   */
  addRootEntity(entity: Entity): void {
    const isRoot = entity._isRoot;

    //let entity become root
    if (!isRoot) {
      entity._isRoot = true;
      entity._removeFromParent();
    }

    //add or remove from scene's rootEntities
    const oldScene = entity._scene;
    if (oldScene !== this) {
      if (oldScene && isRoot) {
        oldScene._removeEntity(entity);
      }
      this._rootEntities.push(entity);
      Entity._traverseSetOwnerScene(entity, this);
    } else if (!isRoot) {
      this._rootEntities.push(entity);
    }

    //process entity active/inActive
    if (this._isActiveInEngine) {
      !entity._isActiveInHierarchy && entity._isActive && entity._processActive();
    } else {
      entity._isActiveInHierarchy && entity._processInActive();
    }
  }

  /**
   * 移除根实体。
   * @param entity - 根实体
   */
  removeRootEntity(entity: Entity): void {
    if (entity._isRoot && entity._scene == this) {
      this._removeEntity(entity);
      this._isActiveInEngine && entity._processInActive();
      Entity._traverseSetOwnerScene(entity, null);
    }
  }

  /**
   * 通过索引获取根实体。
   * @param index - 索引
   */
  getRootEntity(index: number = 0): Entity | null {
    return this._rootEntities[index];
  }

  /**
   * 销毁场景。
   */
  destroy(): void {
    this._isActiveInEngine && (this._engine.sceneManager.activeScene = null);
    Scene.sceneFeatureManager.callFeatureMethod(this, "destroy", [this]);
    for (let i = 0, n = this.rootEntitiesCount; i < n; i++) {
      this._rootEntities[i].destroy();
    }
    this._rootEntities.length = 0;
    this._activeCameras.length = 0;
    (Scene.sceneFeatureManager as any)._objects = [];
    this._destroyed = true;
  }

  /**
   * 向当前场景注册一个摄像机对象
   * @param {CameraComponent} camera 摄像机对象
   * @private
   */
  attachRenderCamera(camera: Camera): void {
    const index = this._activeCameras.indexOf(camera);
    if (index === -1) {
      this._activeCameras.push(camera);
    } else {
      Logger.warn("Camera already attached.");
    }
  }

  /**
   * 从当前场景移除一个摄像机对象
   * @param {CameraComponent} camera 摄像机对象
   * @private
   */
  detachRenderCamera(camera: Camera): void {
    const index = this._activeCameras.indexOf(camera);
    if (index !== -1) {
      this._activeCameras.splice(index, 1);
    }
  }

  /**
   * @internal
   */
  _processActive(active: boolean): void {
    this._isActiveInEngine = active;
    const rootEntities = this._rootEntities;
    for (let i = rootEntities.length - 1; i >= 0; i--) {
      const entity = rootEntities[i];
      if (entity._isActive) {
        active ? entity._processActive() : entity._processInActive();
      }
    }
  }

  private _removeEntity(entity: Entity): void {
    const oldRootEntities = this._rootEntities;
    oldRootEntities.splice(oldRootEntities.indexOf(entity), 1);
  }

  //-----------------------------------------@deprecated-----------------------------------
  static registerFeature(Feature: new () => SceneFeature) {
    Scene.sceneFeatureManager.registerFeature(Feature);
  }

  findFeature<T extends SceneFeature>(Feature: { new (): T }): T {
    return Scene.sceneFeatureManager.findFeature(this, Feature) as T;
  }

  features: SceneFeature[] = [];

  /**
   * @deprecated
   * 射线
   * @param ray
   */
  public raycast(ray: { origin: Vector3; direction: Vector3 }, outPos?: Vector3, tag?: MaskList): any {}
}
