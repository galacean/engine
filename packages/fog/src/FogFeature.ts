import { SceneFeature } from "@alipay/o3-core";
import { ALinearFog } from "./ALinearFog";
import { AEXP2Fog } from "./AEXP2Fog";
import { AFog } from "./AFog";

/**
 * 是否有雾效特性
 * @private
 */
export function hasFogFeature() {
  return true;
}

/**
 * 获取雾效相关宏
 * @private
 */
export function getFogMacro() {
  return this.findFeature(FogFeature).macro;
}

/**
 * 设置雾参数到材质
 * @param {Material} mtl 材质
 * @private
 */
export function bindFogToMaterial(mtl) {
  this.findFeature(FogFeature).bindFogToMaterial(mtl);
}

/**
 * 雾效场景特性
 * @private
 */
export class FogFeature extends SceneFeature {
  private _fog;
  private _macros;

  constructor() {
    super();
    this._fog = null;
    this._macros = [];
  }

  /**
   * 雾
   */
  get fog() {
    return this._fog;
  }

  set fog(v) {
    if (v !== this._fog) {
      this._fog = v;
      const macro = [];
      if (v instanceof AFog) {
        macro.push("O3_HAS_FOG");

        if (v instanceof AEXP2Fog) {
          macro.push("O3_FOG_EXP2");
        }
      }

      if (this._macros.length !== macro.length) {
        this._macros = macro;
      }
    }
  }

  /**
   * 宏
   */
  get macro() {
    return this._macros;
  }

  /**
   * @private
   * 绑定雾参数到材质
   * @param {Material} mtl 材质
   */
  bindFogToMaterial(mtl) {
    if (this.fog && mtl.useFog) {
      this.fog.bindMaterialValues(mtl);
    }

    return this;
  }
}
