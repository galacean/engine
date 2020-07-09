import { DataType } from "@alipay/o3-base";
import { RenderTarget } from "@alipay/o3-material";
import { mat4, MathUtil } from "@alipay/o3-math";
import { DirectLight, PointLight, SpotLight } from "@alipay/o3-lighting";
import { vec2 } from "@alipay/o3-math";
/**
 * 阴影的管理类
 * @private
 */
export class LightShadow {
  private _mapSize;
  private _renderTarget;
  public bias;
  public intensity;
  public radius;
  public projectionMatrix;

  constructor(props = { width: 512, height: 512 }) {
    this._mapSize = vec2.fromValues(props.width, props.height);

    this._renderTarget = new RenderTarget("shadowMap", { ...props, clearColor: [1.0, 1.0, 1.0, 1.0] });

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
     * @member {mat4}
     */
    this.projectionMatrix = mat4.create();
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
    return this._renderTarget.texture;
  }

  /**
   * shadow map 纹理大小
   * @member {vec2}
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
      mat4.ortho(this.projectionMatrix, -5, 5, -5, 5, 0.1, 50);
    }

    /**
     * 点光源初始化投影矩阵，默认配置：fov: 50, aspect: 1, near: 0.5, far: 50
     */
    if (light instanceof PointLight) {
      mat4.perspective(this.projectionMatrix, MathUtil.toRadian(50), 1, 0.5, 50);
    }

    /**
     * 聚光灯初始化投影矩阵，默认配置：fov: this.angle * 2 * Math.sqrt(2), aspect: 1, near: 0.1, far: this.distance + 5
     */
    if (light instanceof SpotLight) {
      const fov = Math.min(Math.PI / 2, light.angle * 2 * Math.sqrt(2));
      mat4.perspective(this.projectionMatrix, fov, 1, 0.1, light.distance + 5);
    }
  }

  /**
   * 设置 Shadow Map 的大小, 取值需要是2的整数次幂
   * @param {number} width
   * @param {number} height
   */
  setMapSize(width, height) {
    if (
      MathUtil.isPowerOf2(width) &&
      MathUtil.isPowerOf2(height) &&
      (this._mapSize.width !== width || this._mapSize.height !== height)
    ) {
      this._mapSize = vec2.fromValues(width, height);
      this._renderTarget = new RenderTarget("shadowMap", { width, height, clearColor: [1.0, 1.0, 1.0, 1.0] });
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
