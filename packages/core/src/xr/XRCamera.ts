import { Matrix, Vector4 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { Entity } from "../Entity";
import { EnumXREye } from "./enum/EnumXREye";

export class XRCamera extends Camera {
  private static _tempMatrix: Matrix = new Matrix();
  private static _tempVector4: Vector4 = new Vector4();

  private _eye: EnumXREye = EnumXREye.none;
  constructor(entity: Entity) {
    super(entity);
  }

  get eye() {
    return this._eye;
  }

  set eye(value: EnumXREye) {
    this._eye = value;
  }

  updateByEye(view: XRView) {
    if (!view) return;
    const layer = this.engine.xrManager.xrBaseLayer;
    const { _tempMatrix: tempMatrix } = XRCamera;
    // 投影矩阵
    tempMatrix.copyFromArray(view.projectionMatrix);
    this.projectionMatrix = tempMatrix;
    // 位姿矩阵
    tempMatrix.copyFromArray(view.transform.matrix);
    const { transform } = this.entity;
    transform.worldMatrix = tempMatrix;
    if (!layer) return;
    const xrViewport = layer.getViewport(view);
    const { framebufferWidth, framebufferHeight } = layer;
    const width = xrViewport.width / framebufferWidth;
    const height = xrViewport.height / framebufferHeight;
    const x = xrViewport.x / framebufferWidth;
    const y = 1 - xrViewport.y / framebufferHeight - height;
    this.viewport = XRCamera._tempVector4.set(x, y, width, height);
  }
}
