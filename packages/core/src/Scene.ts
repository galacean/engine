import { Logger, EventDispatcher, MaskList } from "@alipay/o3-base";
import { FeatureManager } from "./FeatureManager";
import { Entity } from "./Entity";
import { Engine } from "./Engine";
import { Camera } from "./Camera";
import { SceneFeature } from "./SceneFeature";
import { Vector4 } from "@alipay/o3-math/types/type";
import { ComponentsManager } from "./ComponentsManager";

/*
@todo: delete
Scene Feature:
{
 type: "type_name",
 preUpdate : function(scene) {},
 postUpdate : function(scene) {},
 preRender : function(scene, camera) {},
 postRender : function(scene, camera) {},
}
*/
const sceneFeatureManager = new FeatureManager<SceneFeature>();

/**
 * 场景：管理 SceneGraph 中的所有对象，并执行每帧的更新计算和渲染操作
 * @class
 */
export class Scene extends EventDispatcher {
  /**
   * @todo: migrate to camera
   * 裁剪面，平面方程组。裁剪面以下的片元将被剔除绘制
   * @example
   * scene.clipPlanes = [[0,1,0,0]];
   * */
  public clipPlanes: Vector4[] = [];
  public _componentsManager: ComponentsManager = new ComponentsManager();
  public _activeCameras: Camera[] = [];

  private _engine: Engine;
  private _destroyed: boolean = false;
  private _rootEntities: Entity[] = [];

  /** 当前的 Engine 对象
   * @member {Engine}
   * @readonly
   */
  get engine(): Engine {
    return this._engine;
  }

  /**
   * 根节点的数量。
   */
  get rootEntitiesCount(): number {
    return this._rootEntities.length;
  }

  /**
   * 是否已销毁。
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * 构造函数
   * @param {Engine} engine 引擎对象
   */
  constructor(engine?: Engine) {
    super();

    this._engine = engine || Engine._getDefaultEngine();

    sceneFeatureManager.addObject(this);
  }

  /**
   * 添加根节点。
   * @param entity - 根节点
   */
  public addRootEntity(entity: Entity): void {
    const index = this._rootEntities.indexOf(entity);
    if (index !== -1) return;

    entity._isRoot = true;
    entity._scene = this;
    entity.parent = null;
    entity.isActive = true;
    entity._isActiveInHierarchy = true;
    this._rootEntities.push(entity);
  }

  /**
   * 移除根节点。
   * @param entity - 根节点
   */
  public removeRootEntity(entity: Entity): void {
    const index = this._rootEntities.indexOf(entity);
    if (index !== -1) {
      this._rootEntities[index].isActive = false;
      this._rootEntities.splice(index, 1);
    }
  }

  /**
   * 通过索引获取根节点。
   * @param index - 索引
   */
  public getRootEntity(index: number = 0): Entity | null {
    return this._rootEntities[index];
  }

  /**
   * 销毁场景。
   */
  public destroy(): void {
    if (this._engine.sceneManager._scene === this) this._engine.sceneManager.scene = null;
    //继续销毁所有根节点
    sceneFeatureManager.callFeatureMethod(this, "destroy", [this]);
    this._rootEntities.forEach((rootEntity) => {
      rootEntity.destroy();
    });
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
  public update(deltaTime: number): void {
    this._componentsManager.callScriptOnStart();
    this._componentsManager.callScriptOnUpdate(deltaTime);
    this._componentsManager.callAnimationUpdate(deltaTime);
    this._componentsManager.callScriptOnLateUpdate();
  }

  /** 渲染：场景中的每个摄像机执行一次渲染
   * @private
   */
  public render(): void {
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
  public attachRenderCamera(camera: Camera): void {
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
  public detachRenderCamera(camera: Camera): void {
    const index = this._activeCameras.indexOf(camera);
    if (index !== -1) {
      this._activeCameras.splice(index, 1);
    }
  }

  //-----------------------------------------@deprecated-----------------------------------
  public static registerFeature(Feature: new () => SceneFeature) {
    sceneFeatureManager.registerFeature(Feature);
  }

  public findFeature<T extends SceneFeature>(Feature: { new (): T }): T {
    return sceneFeatureManager.findFeature(this, Feature) as T;
  }

  public features: SceneFeature[] = [];
}
