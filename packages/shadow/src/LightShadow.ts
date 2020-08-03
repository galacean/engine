import { DataType } from "@alipay/o3-base";
import { RenderTarget, RenderColorTexture } from "@alipay/o3-material";
import { Matrix4x4, MathUtil, Vector2 } from "@alipay/o3-math";
import { DirectLight, PointLight, SpotLight } from "@alipay/o3-lighting";

/**
 * 阴影的管理类
 * @private
 */
export class LightShadow {
  private rhi;
  private _mapSize;
  private _renderTarget;
  public bias;
  public intensity;
  public radius;
  public projectionMatrix;

  constructor(props = { width: 512, height: 512 }) {
    this._mapSize = new Vector2(props.width, props.height);
    this._renderTarget = new RenderTarget(props.width, props.height, new RenderColorTexture(props.width, props.height));

    /**
     * （偏斜）
     * @member {float}
     */
    this.bias = 0.005;

    /**
     * （投影强度）值越大投影越清晰越黑
     * @member {float}
     */
    this.intensity = 0.2;

    /**
     * 阴影 PCF 插值使用的像素范围
     * @member { float }
     */
    this.radius = 1.0;

    /**
     * 生成 shadow map 使用的投影矩阵
     * @member {Matrix4x4}
     */
    this.projectionMatrix = new Matrix4x4();
  }

  /**
   * shadow map 对应的 RenderTarget
   * @member {RenderTarget}
   * @readonly
   */
  get renderTarget() {
    return this._renderTarget;
  }

  /**
   * shadow map 纹理对象
   * @member {Texture2D}
   * @readonly
   */
  get map() {
    return this._renderTarget.getColorTexture();
  }

  /**
   * shadow map 纹理大小
   * @member {Vector2}
   * @readonly
   */
  get mapSize() {
    return this._mapSize;
  }

  /**
   * 初始化光照的投影矩阵
   * @param {ALight} light
   */
  initShadowProjectionMatrix(light) {
    /**
     * 方向光初始化投影矩阵，默认覆盖区域 left: -5, right: 5, bottom: -5, up: 5, near: 0.5, far: 50
     */
    if (light instanceof DirectLight) {
      Matrix4x4.ortho(-5, 5, -5, 5, 0.1, 50, this.projectionMatrix);
    }

    /**
     * 点光源初始化投影矩阵，默认配置：fov: 50, aspect: 1, near: 0.5, far: 50
     */
    if (light instanceof PointLight) {
      Matrix4x4.perspective(MathUtil.degreeToRadian(50), 1, 0.5, 50, this.projectionMatrix);
    }

    /**
     * 聚光灯初始化投影矩阵，默认配置：fov: this.angle * 2 * Math.sqrt(2), aspect: 1, near: 0.1, far: this.distance + 5
     */
    if (light instanceof SpotLight) {
      const fov = Math.min(Math.PI / 2, light.angle * 2 * Math.sqrt(2));
      Matrix4x4.perspective(fov, 1, 0.1, light.distance + 5, this.projectionMatrix);
    }
  }

  /**
   * 将阴影参数值提交到阴影材质对象
   * @param {Material} mtl
   * @param {number} index
   * @param {Component} component
   * @param {ALight} light
   */
  bindShadowValues(mtl, index, light) {
    // 光源视点VP
    mtl.setValue(`u_viewMatFromLight[${index}]`, light.viewMatrix);
    mtl.setValue(`u_projMatFromLight[${index}]`, this.projectionMatrix);

    // shadow map
    const uniformName = `u_shadows[${index}]`;
    mtl.setValue(uniformName + ".bias", this.bias);
    mtl.setValue(uniformName + ".intensity", this.intensity);
    mtl.setValue(uniformName + ".radius", this.radius);
    mtl.setValue(uniformName + ".mapSize", this._mapSize);

    mtl.setValue(`u_shadowMaps[${index}]`, this.map);
  }

  /**
   * 生成 Technique 所需的 uniform 定义
   * @param {number} index ShadowMap Index
   */
  static getUniformDefine(index) {
    const uniforms = {};

    uniforms[`u_viewMatFromLight[${index}]`] = {
      name: `u_viewMatFromLight[${index}]`,
      type: DataType.FLOAT_MAT4
    };

    uniforms[`u_projMatFromLight[${index}]`] = {
      name: `u_projMatFromLight[${index}]`,
      type: DataType.FLOAT_MAT4
    };

    const uniformName = `u_shadows[${index}]`;
    uniforms[uniformName + ".bias"] = {
      name: uniformName + ".bias",
      type: DataType.FLOAT
    };

    uniforms[uniformName + ".intensity"] = {
      name: uniformName + ".intensity",
      type: DataType.FLOAT
    };

    uniforms[uniformName + ".radius"] = {
      name: uniformName + ".radius",
      type: DataType.FLOAT
    };

    uniforms[uniformName + ".mapSize"] = {
      name: uniformName + ".mapSize",
      type: DataType.FLOAT_VEC2
    };

    uniforms[`u_shadowMaps[${index}]`] = {
      name: `u_shadowMaps[${index}]`,
      type: DataType.SAMPLER_2D
    };
    return uniforms;
  }
}
