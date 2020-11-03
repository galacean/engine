import { Engine } from "../Engine";
import { Material } from "./Material";

/**
 * 管理多个 Technique, 根据渲染的需要自动切换内部的 Technique 对象
 * @remarks 典型应用：Shadow Mapping 算法中，场景使用一个统一的 replace material 渲染深度贴图
 */
export class ComplexMaterial extends Material {
  private _techniquePool;

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor(engine: Engine, name) {
    super(engine, name);

    this._techniquePool = {}; // technique pool: [key]->value
  }

  /**
   * 在绘制之前，准备好内部的 Technique 对象
   */
  prepareDrawing(context, component, primitive) {
    const camera = context.camera;
    const tech = this._requireTechnique(camera, component, primitive);

    if (tech) {
      this._technique = tech;
      super.prepareDrawing(context, component, primitive);
    }
  }

  /**
   * 清空所有Technique。
   */
  clearTechniques() {
    this._techniquePool = {};
  }

  /**
   * 根据当前对象的渲染需求，取得一个可用的 Technique
   */
  _requireTechnique(camera, component, primitive) {
    const key = this._getTechniqueKey(camera, component, primitive);
    let tech = this._techniquePool[key];
    if (!tech) {
      tech = this._generateTechnique(camera, component, primitive);
      this._techniquePool[key] = tech;
    }

    return tech;
  }

  /**
   * 由派生类去实现，针对某个特定的对象，生成一个新的它所需要的 Technique 对象
   */
  _generateTechnique(camera, component, primitive) {}

  /**
   * 按照当前对象是否为 skin、骨骼个数，生成一个 Technique 的索引字符串
   */
  _getTechniqueKey(camera, component, primitive) {
    const isSkin = component.skin != null;
    const jontCount = isSkin ? component.skin.joints.length : 0;

    let key = isSkin ? "skin_" : "static_";
    if (isSkin) {
      key += "jont" + jontCount;
    }

    return key;
  }
}
