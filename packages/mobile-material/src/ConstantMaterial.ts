import {CommonMaterial} from './CommonMaterial';
import ConstantShader from './shader/Constant.glsl';

/**
 * 显示固定颜色（不计算光照）的材质
 * color = <emission> + <ambient> * al
 * @private
 */
export class ConstantMaterial extends CommonMaterial {

  /**
   * 生成内部所使用的 Technique 对象
   * @private
   */
  _generateTechnique() {

    this._internalGenerate('ConstantMaterial', ConstantShader);

  }

}
