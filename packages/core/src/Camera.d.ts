import { NodeAbility } from ".";
import { BasicSceneRenderer, GLRenderHardware } from "./type";
import { RenderTarget } from "./graphics/RenderTarget";
import { TextureCubeFace } from "./graphics/TextureCubeFace";

/**
 * 摄像机组件，用于渲染场景。
 */
export declare abstract class Camera extends NodeAbility {
  /**
   * 近裁剪平面。
   */
  get nearClipPlane(): number;
  set nearClipPlane(value: number);

  /**
   * 远裁剪平面。
   */
  get farClipPlane(): number;
  set farClipPlane(value: number);

  /**
   * 视场，单位是角度制，透视投影时生效。
   */
  get fieldOfView(): number;
  set fieldOfView(value: number);

  /**
   * 横纵比，默认由视口的宽高比自动计算，如果手动设置会保持手动值，调用resetAspectRatio()可恢复。
   */
  get aspectRatio(): number;
  set aspectRatio(value: number);

  /**
   * 归一化视口，左上角为（0，0）坐标，右下角为（1，1）。
   */
  get viewport(): Vector4;
  set viewport(value: Vector4);

  /**
   * 正交模式（true）还是透视模式(false)。
   */
  get orthographic(): boolean;
  set orthographic(value: boolean);

  /**
   * 正交模式下相机的一半尺寸。
   */
  get orthographicSize(): number;
  set orthographicSize(value: number);

  /**
   * 背景清除标记。
   */
  get clearFlags(): CameraClearFlags;
  set clearFlags(value: CameraClearFlags);

  /**
   * 背景颜色,clearFlags值为DepthColor时有效。
   */
  get backgroundColor(): Color;
  set backgroundColor(value: Color);

  /**
   * 背景天空网格,clearFlags模式为DepthSky时有效。
   */
  get backgroundSkyMesh(): Mesh;
  set backgroundSkyMesh(value: Mesh);

  /**
   * 背景天空材质,clearFlags模式为DepthSky时有效。
   */
  get backgroundSkyMaterial(): Material;
  set backgroundSkyMaterial(value: Material);

  /**
   * 场景的的剔除遮罩，采用位运算机制。
   */

  get cullMask(): number;
  set cullMask(value: number);

  /**
   * 渲染优先级。
   */
  set priority(value: number);
  get priority(): number;

  /**
   * 视图矩阵。
   */
  get viewMatrix(): Matrix;

  /**
   * 投影矩阵,默认由相机的相关参数计算计算，如果手动设置会保持手动值，调用resetProjectionMatrix()可恢复。
   */
  get projectionMatrix(): Matrix;
  set projectionMatrix(value: Matrix);

  /**
   * 渲染目标,如果为空则渲染到屏幕上。
   */
  get renderTarget(): RenderTarget;
  set renderTarget(value: RenderTarget);

  /**
   * 是否开启HDR。
   */
  get enableHDR(): boolean;
  set enableHDR(value: boolean);

  /**
   * 恢复视口的宽高比。
   */
  resetAspectRatio(): void;

  /**
   * 恢复投影矩阵。
   */
  resetProjectionMatrix(): void;

  /**
   * 将一个位置坐标从世界空间变换到视口空间。
   * @param position - 世界空间坐标
   * @param out - X和Y为视口空间坐标，Z为视口深度，近裁剪面为0，远裁剪面为1，W为距离相机的世界单位距离
   */
  worldToViewportPoint(position: Vector3, out: Vector4): Vector4;

  /**
   * 将一个位置坐标从视口空间变换到世界空间。
   * @param position - X和Y为视口空间坐标，Z为视口深度，近裁剪面为0，远裁剪面为1
   * @param out - 世界空间坐标
   */
  viewportToWorldPoint(position: Vector3, out: Vector3): Vector3;

  /**
   * 通过视口空间坐标获取射线，生成射线的起点在相机的近裁面并穿过位置的X和Y坐标，Z坐标忽略。
   * @param position - 视口空间坐标
   * @param out - 射线
   */
  viewportPointToRay(position: Vector3 | Vector2, out: Ray): void;

  /**
   * 将一个位置的X和Y坐标从屏幕空间变换到视口空间,Z坐标忽略。
   * @param position - 屏幕空间坐标
   * @param out - 视口空间坐标
   */
  screenToViewportPoint(position: Vector3 | Vector2, out: Vector3 | Vector2): void;

  /**
   * 将一个位置的X和Y坐标从视口空间变换到屏幕空间,Z坐标忽略。
   * @param position - 视口空间坐标
   * @param out - 屏幕空间坐标
   */
  viewportToScreenPoint(position: Vector3 | Vector2, out: Vector3 | Vector2): void;

  /**
   * 手动调用相机的渲染。
   * @param cubeFaces 立方体的渲染面集合,如果renderTarget.isCube=true时生效
   */
  render(cubeFaces?: TextureCubeFace): void;

  //---------------------------------------deprecated------------------------------------------

  /**
   * @deprecated
   */
  get sceneRenderer(): BasicSceneRenderer;

  /**
   * @deprecated
   */
  get inverseViewMatrix(): Matrix;

  /**
   * @deprecated
   */
  get renderHardware(): GLRenderHardware;
}

//-------------------------------------------------------------Temp Type Convert--------------------------------------------------------
type Ray = any;
type Color = any;
type Mesh = any;
type Material = any;
type Vector2 = [number, number];
type Vector3 = [number, number, number];
type Vector4 = [number, number, number, number];
type Quaternion = [number, number, number, number];
type Matrix = [
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
