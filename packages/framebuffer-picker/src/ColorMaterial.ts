import { Logger, DataType } from "@alipay/o3-base";
import { Material, RenderTechnique } from "@alipay/o3-material";
import vs from "./color.vs.glsl";
import fs from "./color.fs.glsl";

/**
 * @private
 * 单色渲染材质
 */
class ColorMaterial extends Material {
  private _currentId: number = 0;
  private _primitivesMap = [];
  protected _technique;

  constructor(name = "FRAMEBUFFER_PICKER_COLOR_MATERIAL") {
    super(name);
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
  id2Color(id) {
    if (id >= 0xffffff) {
      Logger.warn("Framebuffer Picker encounter primitive's id greater than " + 0xffffff);
      return new Float32Array([0, 0, 0]);
    }

    const color = new Float32Array(3);
    color[0] = (id & 0xff) / 255;
    color[1] = ((id & 0xff00) >> 8) / 255;
    color[2] = ((id & 0xff0000) >> 16) / 255;
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
  prepareDrawing(camera, component, primitive, originalMaterial?: Material) {
    if (!this._technique) this.generateTechnique(originalMaterial);

    this._currentId += 1;
    this._primitivesMap[this._currentId] = { component, primitive };
    this.setValue("u_colorId", this.id2Color(this._currentId));

    super.prepareDrawing(camera, component, primitive);
  }

  /**
   * @private
   */
  generateTechnique(originalMaterial: Material) {
    const tech = new RenderTechnique("Framebuffer_Picker_Color_Material");
    tech.isValid = true;
    tech.uniforms = {
      u_colorId: {
        name: "u_colorId",
        type: DataType.FLOAT_VEC3
      }
    };
    if (originalMaterial && originalMaterial.technique) {
      tech.states = originalMaterial.technique.states;
    }
    tech.fragmentPrecision = "highp";
    tech.vertexShader = vs;
    tech.fragmentShader = fs;

    this._technique = tech;
  }
}

export { ColorMaterial };
