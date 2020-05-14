import { NodeAbility } from "./NodeAbility";
import { mat4 } from "@alipay/o3-math";
import { ClearMode } from "@alipay/o3-base";
import { BasicSceneRenderer } from "./type";

export enum ProjectionType {
  ORTHOGRAPHIC,
  PERSPECTIVE
}

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];
type Mat4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

type Ray = { origin: Vec3; direction: Vec3 };

export abstract class StandardCamera extends NodeAbility {
  private projectionMode: ProjectionType;
  // todo 类型修改
  private _projectionMatrix: Mat4;
  private _inverseViewMatrix: Mat4;
  // todo 类型修改
  private _viewMatrix: Mat4;
  private _clearMode: ClearMode;
  // todo 类型修改
  private _clearParam: Vec4;
  private _sceneRenderer: BasicSceneRenderer;
  // todo 类型修改
  private viewport: Vec4;
  private _near: number;
  private _far: number;
  private _fov: number;
  private _size: number;

  /**
   * 投影矩阵
   */
  public get projectionMatrix(): ReadonlyArray<number> {
    return this._projectionMatrix;
  }

  /**
   * 视图矩阵
   */
  public get viewMatrix(): ReadonlyArray<number> {
    return this._viewMatrix;
  }

  /**
   * 近裁剪平面
   */
  public get near(): number {
    return this._near;
  }

  /**
   * 远裁剪平面
   */
  public get far(): number {
    return this._far;
  }

  /**
   * 视角，透视投影时生效
   */
  public get fov(): number {
    return this._fov;
  }

  /**
   * 正交模式下相机的一半尺寸
   */
  public get size(): number {
    return this._size;
  }

  /**
   * 世界坐标转换成屏幕坐标
   * @param worldPoint
   */
  public worldToScreenPoint(worldPoint: Vec3): Vec3 {
    return [0, 0, 0];
  }

  /**
   * 世界坐标转化成 viewport 坐标
   */
  public worldToViewportPoint(worldPoint: Vec3): Vec3 {
    return [0, 0, 0];
  }

  /**
   * 屏幕点转成射线
   * @param position
   */
  public screenPointToRay(position: Vec2): Ray {
    return { origin: [0, 0, 0], direction: [0, 0, 0] };
  }

  /**
   * 屏幕坐标转化成视图坐标
   * @param position
   */
  public screenToViewportPoint(position: Vec3): Vec3 {
    return [0, 0, 0];
  }

  /**
   * 屏幕坐标转化成世界坐标
   * @param position
   */
  public screenToWorldPoint(position: Vec3): Vec3 {
    return [0, 0, 0];
  }

  /**
   * 相机视口坐标转化成射线
   * @param position
   */
  public viewportPointToRay(position: Vec2): Ray {
    return { origin: [0, 0, 0], direction: [0, 0, 0] };
  }

  /**
   * 相机视口坐标转化成射线转化成世界坐标
   * @param position
   */
  public viewportToWorldPoint(position: Vec2): Vec3 {
    return [0, 0, 0];
  }

  /**
   * 相机视口坐标转化成屏幕点
   * @param position
   */
  public viewportToScreenPoint(position: Vec3): Vec3 {
    return [0, 0, 0];
  }

  /**
   * 拷贝另一个 camera 的设置
   * @param camera
   */
  public copyFrom(camera: StandardCamera): void {}
}
