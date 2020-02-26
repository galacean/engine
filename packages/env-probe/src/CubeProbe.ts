import { Probe } from "./Probe";
import { Node } from "@alipay/o3-core";
import { mat4, vec3 } from "@alipay/o3-math";
import { CubeProbeConfig } from "./type";

const cacheTarget = vec3.create();
const cacheUp = vec3.create();
const cacheDir = vec3.create();
const fovRadian = (90 * Math.PI) / 180;

/**
 * 立方体探针,生成 cubeTexture,用于 动态环境反射 等效果
 * */
export class CubeProbe extends Probe {
  /** 可以设置探针的位置，默认为原点 [0,0,0] */
  public position = [0, 0, 0];

  private oriViewMatrix = mat4.create();
  private oriInverseViewMatrix = mat4.create();
  private oriProjectionMatrix = mat4.create();
  private oriInverseProjectionMatrix = mat4.create();

  /**
   * 创建探针
   * @param {Node} node
   * @param {CubeProbeConfig} config - 可选配置
   * */
  constructor(node: Node, config: CubeProbeConfig = {}) {
    super(node, {
      ...config,
      isCube: true
    });

    this.position = config.position || [0, 0, 0];
    this.size = config.size || 1024;
  }

  /**
   * 贮藏原相机参数
   * */
  private storeCamera() {
    mat4.copy(this.oriViewMatrix, this.camera.viewMatrix);
    mat4.copy(this.oriInverseViewMatrix, this.camera.inverseViewMatrix);
    mat4.copy(this.oriProjectionMatrix, this.camera.projectionMatrix);
    mat4.copy(this.oriInverseProjectionMatrix, this.camera.inverseProjectionMatrix);
  }

  /**
   * 还原相机参数
   * */
  private restoreCamera() {
    mat4.copy(this.camera.viewMatrix, this.oriViewMatrix);
    mat4.copy(this.camera.inverseViewMatrix, this.oriInverseViewMatrix);
    mat4.copy(this.camera.projectionMatrix, this.oriProjectionMatrix);
    mat4.copy(this.camera.inverseProjectionMatrix, this.oriInverseProjectionMatrix);
  }

  protected preRender() {
    super.preRender();
    this.storeCamera();
  }

  protected render() {
    // 渲染6个面
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      // 设置渲染面
      this.rhi.setRenderTargetFace(this.renderPass.renderTarget, faceIndex);

      // clear
      this.rhi.clearRenderTarget(this.renderPass.clearMode, this.renderPass.clearParam);

      // 改 camera 参数
      this.setCamera(faceIndex);

      // render
      super.render();
    }
  }

  protected postRender() {
    super.postRender();
    this.restoreCamera();
  }

  /**
   * 根据渲染面设置相机参数
   * */
  private setCamera(faceIndex: number) {
    switch (faceIndex) {
      // positive_x
      case 0:
        vec3.set(cacheUp, 0, -1, 0);
        vec3.set(cacheDir, 1, 0, 0);
        break;
      // negative_x
      case 1:
        vec3.set(cacheUp, 0, -1, 0);
        vec3.set(cacheDir, -1, 0, 0);
        break;
      // positive_y
      case 2:
        vec3.set(cacheUp, 0, 0, 1);
        vec3.set(cacheDir, 0, 1, 0);
        break;
      // negative_y
      case 3:
        vec3.set(cacheUp, 0, 0, -1);
        vec3.set(cacheDir, 0, -1, 0);
        break;
      // positive_z
      case 4:
        vec3.set(cacheUp, 0, -1, 0);
        vec3.set(cacheDir, 0, 0, 1);
        break;
      // negative_z
      case 5:
        vec3.set(cacheUp, 0, -1, 0);
        vec3.set(cacheDir, 0, 0, -1);
        break;
    }

    vec3.add(cacheTarget, this.position, cacheDir);
    mat4.lookAt(this.camera.viewMatrix, this.position, cacheTarget, cacheUp);
    mat4.invert(this.camera.inverseViewMatrix, this.camera.viewMatrix);
    mat4.perspective(this.camera.projectionMatrix, fovRadian, 1, this.camera.zNear, this.camera.zFar);
    mat4.invert(this.camera.inverseProjectionMatrix, this.camera.projectionMatrix);
  }

  public set size(size: number) {
    this.renderTarget.width = size;
    this.renderTarget.height = size;
    this.renderTargetSwap.width = size;
    this.renderTargetSwap.height = size;
    this.renderTarget.needRecreate = true;
    this.renderTargetSwap.needRecreate = true;
  }
}
