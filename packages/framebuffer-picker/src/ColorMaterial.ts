import { DataType, Logger, Material, RenderTechnique, Engine } from "@alipay/o3-core";
import { Vector3 } from "@alipay/o3-math";
import fs from "./color.fs.glsl";
import vs from "./color.vs.glsl";

/**
 * @private
 * 单色渲染材质
 */
class ColorMaterial extends Material {
  private _currentId: number = 0;
  private _primitivesMap = [];
  protected _technique;

  constructor(name = "FRAMEBUFFER_PICKER_COLOR_MATERIAL", engine?: Engine) {
    super(name, engine);
    this.reset();
  }

  /**
   * @private
   * 重置对象 id 和索引表
   */
  reset() {
    this._currentId = 0;
    this._primitivesMap = [];
  }

  /**
   * @private
   * id 转换为 RGB 颜色值，0 和 0xffffff 为非法值
   */
  id2Color(id): Vector3 {
    if (id >= 0xffffff) {
      Logger.warn("Framebuffer Picker encounter primitive's id greater than " + 0xffffff);
      return new Vector3(0, 0, 0);
    }

    const color = new Vector3((id & 0xff) / 255, ((id & 0xff00) >> 8) / 255, ((id & 0xff0000) >> 16) / 255);
    return color;
  }

  /**
   * 颜色值转换为 id
   * @param {Array} color 颜色值
   */
  color2Id(color) {
    return color[0] | (color[1] << 8) | (color[2] << 16);
  }

  /**
   * @private
   * 通过颜色查找索引对象
   */
  getObjectByColor(color) {
    return this._primitivesMap[this.color2Id(color)];
  }

  /**
   * @private
   */
  prepareDrawing(context, component, primitive, originalMaterial?: Material) {
    if (!this._technique) this.generateTechnique();
    this.technique.states = originalMaterial?.technique?.states;
    this._currentId += 1;
    this._primitivesMap[this._currentId] = { component, primitive };
    this.setValue("u_colorId", this.id2Color(this._currentId));

    super.prepareDrawing(context, component, primitive);
  }

  /**
   * @private
   */
  generateTechnique() {
    const tech = new RenderTechnique("Framebuffer_Picker_Color_Material");
    tech.isValid = true;
    tech.uniforms = {
      u_colorId: {
        name: "u_colorId",
        type: DataType.FLOAT_VEC3
      }
    };

    tech.fragmentPrecision = "highp";
    tech.vertexShader = vs;
    tech.fragmentShader = fs;

    this._technique = tech;
  }
}

export { ColorMaterial };
