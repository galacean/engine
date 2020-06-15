import { Logger, Util, Event, EventDispatcher, MaskList } from "@alipay/o3-base";
import { FeatureManager } from "./FeatureManager";
import { Node } from "./Node";
import { Engine } from "./Engine";
import { ACamera } from "./ACamera";
import { SceneFeature } from "./SceneFeature";
import { SceneVisitor } from "./SceneVisitor";
import { Vec4 } from "@alipay/o3-math/types/type";
import { ComponentsManager } from "./ComponentsManager";

/*
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
  /** 当前的 Engine 对象
   * @member {Engine}
   * @readonly
   */
  get engine(): Engine {
    return this._engine;
  }

  /**
   * SceneGraph 的 Root 节点
   * @remarks 一般情况下，Root节点的Transform应该保持默认值，其值为单位矩阵
   * @member {Node}
   * @readonly
   */
  get root(): Node {
    return this._root;
  }

  get activeCameras(): ACamera[] {
    return this._activeCameras;
  }

  public static registerFeature(Feature: new () => SceneFeature) {
    sceneFeatureManager.registerFeature(Feature);
  }

  public features: SceneFeature[] = [];

  private _activeCameras: ACamera[];

  private _engine: Engine;

  private _root: Node;

  /**
   * 裁剪面，平面方程组。裁剪面以下的片元将被剔除绘制
   * @example
   * scene.clipPlanes = [[0,1,0,0]];
   * */
  public clipPlanes: Vec4[] = [];

  public _componentsManager: ComponentsManager;

  /**
   * 构造函数
   * @param {Engine} engine 引擎对象
   */
  constructor(engine: Engine) {
    super();

    this._engine = engine;
    this._componentsManager = new ComponentsManager();
    this._root = new Node(this, null, "root");
    this._activeCameras = [];

    sceneFeatureManager.addObject(this);
  }

  public findFeature<T extends SceneFeature>(Feature: { new (): T }): T {
    return sceneFeatureManager.findFeature(this, Feature) as T;
  }

  /**
   * 更新场景中所有对象的状态
   * @param {number} deltaTime 两帧之间的时间
   * @private
   */
  public update(deltaTime: number): void {
    this._componentsManager.callScriptOnUpdate(deltaTime);
    this._componentsManager.callComponentOnUpdate(deltaTime);
    this._componentsManager.callAnimationOnUpdate(deltaTime);
    sceneFeatureManager.callFeatureMethod(this, "preUpdate", [this]); //deprecated
    this._componentsManager.callScriptOnLateUpdate();
  }

  /** 渲染：场景中的每个摄像机执行一次渲染
   * @private
   */
  public render(): void {
    const cameras = this._activeCameras;
    if (cameras.length > 0) {
      for (let i = 0, l = cameras.length; i < l; i++) {
        const camera = cameras[i];
        const cameraNode = camera.node;
        if (camera.enabled && cameraNode.isActiveInHierarchy) {
          this._componentsManager.callRendererOnUpdate();
          this._componentsManager.callScriptOnPreRender();
          sceneFeatureManager.callFeatureMethod(this, "preRender", [this, camera]); //deprecated
          camera.render();
          sceneFeatureManager.callFeatureMethod(this, "postRender", [this, camera]); //deprecated
          this._componentsManager.callScriptOnPostRender();
        }
      }
      this._componentsManager.callComponentDestory();
    } else {
      Logger.debug("NO active camera.");
    }
  }

  /**
   * 向当前场景注册一个摄像机对象
   * @param {CameraComponent} camera 摄像机对象
   * @private
   */
  public attachRenderCamera(camera: ACamera): void {
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
  public detachRenderCamera(camera: ACamera): void {
    const index = this._activeCameras.indexOf(camera);
    if (index !== -1) {
      this._activeCameras.splice(index, 1);
    }
  }

  /**
   * 使用名称查找 Node 对象
   * @param {string} name 对象名称
   * @return {Node}
   */
  public findObjectByName(name: string): Node {
    if (this._root.name === name) {
      return this._root;
    }
    return this._root.findChildByName(name);
  }

  /**
   * 射线
   * @param ray
   */
  public raycast(ray: { origin: number[]; direction: number[] }, outPos?: number[], tag?: MaskList): any {}

  /** 销毁当前场景中的数据 */
  public destroy(): void {
    sceneFeatureManager.callFeatureMethod(this, "destroy", [this]);
    this._root.destroy();
    this._root = null;
    this._activeCameras = null;
    this._componentsManager = null;
  }
}
