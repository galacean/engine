import { Probe } from "./Probe";
import { Node } from "@alipay/o3-core";
import { RenderTarget } from "@alipay/o3-material";
import { RenderPass } from "@alipay/o3-renderer-basic";
import { mat4, vec3 } from "@alipay/o3-math";
import { ReflectionProbeConfig } from "./type";

const cacheTarget = vec3.create();
const cacheUp = vec3.create();
const cacheDir = vec3.create();
const fovRadian = (90 * Math.PI) / 180;

/**
 * 反射探针,生成 cubeTexture
 * */
export class ReflectionProbe extends Probe {
  public renderPass: RenderPass;

  /** 可以设置探针的位置，默认为原点 [0,0,0] */
  public position = [0, 0, 0];

  private readonly renderTarget: RenderTarget;
  private readonly renderTargetSwap: RenderTarget;

  private oriViewMatrix = mat4.create();
  private oriInverseViewMatrix = mat4.create();
  private oriProjectionMatrix = mat4.create();
  private oriInverseProjectionMatrix = mat4.create();

  /**
   * 创建反射探针
   * @param {Node} node
   * @param {PerturbationProbeConfig} config - 可选配置
   * */
  constructor(node: Node, config: ReflectionProbeConfig = {}) {
    super(node, config);
    this.renderTarget = new RenderTarget("_renderTarget" + this.cacheId, {
      ...config,
      isCube: true
    });
    this.renderTargetSwap = new RenderTarget("_renderTarget_swap" + this.cacheId, {
      ...config,
      isCube: true
    });
    this.renderPass = new RenderPass("_renderPass" + this.cacheId, -10, this.renderTarget);

    this.position = config.position || [0, 0, 0];
    this.size = config.size || 1024;

    /** 自定义渲染管道 */
    this.renderPass.renderOverride = true;
    this.customRenderPass();

    this.sceneRenderer.addRenderPass(this.renderPass);
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

  /**
   * 自定义 renderPass
   * */
  protected customRenderPass() {
    this.renderPass.preRender = () => {
      this.storeCamera();
    };

    this.renderPass.postRender = () => {
      this.restoreCamera();

      // 交换 FBO
      // prevent issue: Feedback Loops Between Textures and the Framebuffer.
      if (this.renderPass.enabled) {
        // 钩子
        this.onTextureChange && this.onTextureChange(this.cubeTexture);

        if (this.renderPass.renderTarget === this.renderTarget) {
          this.renderPass.renderTarget = this.renderTargetSwap;
        } else {
          this.renderPass.renderTarget = this.renderTarget;
        }
      }
    };

    this.renderPass.render = () => {
      // 渲染6个面
      for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
        // 设置渲染面
        this.rhi.setRenderTargetFace(this.renderPass.renderTarget, faceIndex);

        // clear
        this.rhi.clearRenderTarget(this.renderPass.clearMode, this.renderPass.clearParam);

        // 改 camera 参数
        this.setCamera(faceIndex);

        // render
        this.renderItems.forEach(item => {
          const { nodeAbility, primitive, mtl } = item;
          if (!(nodeAbility.renderPassFlag & this.renderPassFlag)) return;
          mtl.prepareDrawing(this.camera, nodeAbility, primitive);
          this.rhi.drawPrimitive(primitive, mtl);
        });
      }
    };
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
