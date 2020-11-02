import { Matrix3x3, Vector3 } from "@oasis-engine/math";
import { DataType } from "../base/Constant";
import { Light } from "./Light";

const cacheMat3 = new Matrix3x3();

/**
 * 环境光源
 */
export class EnvironmentMapLight extends Light {
  public diffuseMap;
  public specularMap;
  public diffuse: Vector3;
  public specular: Vector3;
  public diffuseIntensity;
  public specularIntensity;

  /**
   * 生成 Technique 所需的 uniform 定义
   * @param {string} uniformName
   */
  static getUniformDefine(uniformName) {
    const uniforms = {};

    uniforms["u_env_diffuseSampler"] = {
      name: "u_env_diffuseSampler",
      type: DataType.SAMPLER_CUBE
    };

    uniforms["u_env_specularSampler"] = {
      name: "u_env_specularSampler",
      type: DataType.SAMPLER_CUBE
    };

    uniforms[uniformName + ".diffuse"] = {
      name: uniformName + ".diffuse",
      type: DataType.FLOAT_VEC3
    };

    uniforms[uniformName + ".specular"] = {
      name: uniformName + ".specular",
      type: DataType.FLOAT_VEC3
    };

    uniforms[uniformName + ".mipMapLevel"] = {
      name: uniformName + ".mipMapLevel",
      type: DataType.FLOAT
    };

    uniforms[uniformName + ".transformMatrix"] = {
      name: uniformName + ".transformMatrix",
      type: DataType.FLOAT_MAT3
    };

    uniforms[uniformName + ".diffuseIntensity"] = {
      name: uniformName + ".diffuseIntensity",
      type: DataType.FLOAT
    };

    uniforms[uniformName + ".specularIntensity"] = {
      name: uniformName + ".specularIntensity",
      type: DataType.FLOAT
    };

    return uniforms;
  }

  /**
   * 环境光源
   * @param {Entity} entity 节点对象
   */
  constructor(entity) {
    super(entity);
    this.diffuse = new Vector3(0.3, 0.3, 0.3);
    this.specular = new Vector3(0.5, 0.5, 0.5);
    this.diffuseIntensity = 1;
    this.specularIntensity = 1;
  }

  /**
   * 是否使用diffuse贴图
   * @private
   * @returns {Boolean}
   */
  get useDiffuseMap() {
    return !!this.diffuseMap;
  }

  /**
   * 是否使用Specular贴图
   * @private
   * @returns {Boolean}
   */
  get useSpecularMap() {
    return !!this.specularMap;
  }

  /**
   * 将灯光参数绑定到指定的材质对象上
   */
  bindMaterialValues(mtl, uniformName) {
    mtl.setValue(uniformName + ".diffuseIntensity", this.diffuseIntensity);
    mtl.setValue(uniformName + ".specularIntensity", this.specularIntensity);

    if (this.useDiffuseMap) {
      mtl.setValue("u_env_diffuseSampler", this.diffuseMap);
    } else {
      mtl.setValue(uniformName + ".diffuse", this.diffuse);
    }

    if (this.useSpecularMap) {
      mtl.setValue("u_env_specularSampler", this.specularMap);
      mtl.setValue(uniformName + ".mipMapLevel", this.specularMap.mipmapCount);
    } else {
      mtl.setValue(uniformName + ".specular", this.specular);
    }

    // 支持旋转
    const transformMatrix = this.entity.transform.worldMatrix;
    cacheMat3.setValueByMatrix(transformMatrix);
    mtl.setValue(uniformName + ".transformMatrix", cacheMat3);
  }
}
