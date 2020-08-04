import { Logger, EventDispatcher, MaskList } from "./base";
import { FeatureManager } from "./FeatureManager";
import { Entity } from "./Entity";
import { Engine } from "./Engine";
import { Camera } from "./Camera";
import { SceneFeature } from "./SceneFeature";
import { Vector4 } from "@alipay/o3-math/types/type";
import { ComponentsManager } from "./ComponentsManager";

const sceneFeatureManager = new FeatureManager<SceneFeature>();

/**
 * 场景。
 */
export class Scene extends EventDispatcher {
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

  _componentsManager: ComponentsManager = new ComponentsManager();
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

    sceneFeatureManager.addObject(this);
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
    sceneFeatureManager.callFeatureMethod(this, "destroy", [this]);
    for (let i = 0, n = this.rootEntitiesCount; i < n; i++) {
      this._rootEntities[i].destroy();
    }
    this._rootEntities.length = 0;
    this._activeCameras.length = 0;
    (sceneFeatureManager as any)._objects = [];
    this._componentsManager.callComponentDestory();
    this._componentsManager = null;
    this._destroyed = true;
  }

  /**
   * 更新场景中所有对象的状态
   * @param {number} deltaTime 两帧之间的时间
   * @private
   */
  update(deltaTime: number): void {
    this._componentsManager.callScriptOnStart();
    this._componentsManager.callScriptOnUpdate(deltaTime);
    this._componentsManager.callAnimationUpdate(deltaTime);
    this._componentsManager.callScriptOnLateUpdate();
  }

  /** 渲染：场景中的每个摄像机执行一次渲染
   * @private
   */
  render(): void {
    const cameras = this._activeCameras;
    const deltaTime = this._engine.time.deltaTime;
    this._componentsManager.callRendererOnUpdate(deltaTime);
    if (cameras.length > 0) {
      // 针对 priority 进行排序
      //@ts-ignore
      cameras.sort((camera1, camera2) => camera1.priority - camera2.priority);
      for (let i = 0, l = cameras.length; i < l; i++) {
        const camera = cameras[i];
        const cameraEntity = camera.entity;
        if (camera.enabled && cameraEntity.isActiveInHierarchy) {
          //@todo 后续优化
          this._componentsManager.callCameraOnBeginRender(camera);
          camera.render();
          //@todo 后续优化
          this._componentsManager.callCameraOnEndRender(camera);
        }
      }
    } else {
      Logger.debug("NO active camera.");
    }
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
    sceneFeatureManager.registerFeature(Feature);
  }

  findFeature<T extends SceneFeature>(Feature: { new (): T }): T {
    return sceneFeatureManager.findFeature(this, Feature) as T;
  }

  features: SceneFeature[] = [];
}
