import { DataType } from "@alipay/o3-core";
import { Light } from "./Light";
import { Vector3, Matrix3x3 } from "@alipay/o3-math";

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
   * @param {Object} props 包含以下参数
   * @param {TextureCubeMap} [props.diffuseMap=undefined] 环境光贴图
   * @param {TextureCubeMap} [props.specularMap=undefined] 高光贴图
   * @param {Vector3} [props.diffuse=new Vector3(0.5, 0.5, 0.5)] 单色环境光，当环境光贴图不存在时使用
   * @param {Vector3} [props.specular=new Vector3(0.5, 0.5, 0.5)] 单色高光，当高光贴图不存在时使用
   * @param {Number} [props.diffuseIntensity=1] 环境光强度
   * @param {Number} [props.specularIntensity=1] 高光强度
   */
  constructor(entity, props) {
    super(entity);

    const { name, diffuseMap, specularMap, diffuse, specular, diffuseIntensity, specularIntensity } = props;
    this.name = name;

    /**
     * 环境光贴图
     * @member {TextureCubeMap}
     */
    this.diffuseMap = diffuseMap;

    /**
     * 高光贴图
     * @member {TextureCubeMap}
     */
    this.specularMap = specularMap;

    /**
     * 单色环境光
     * @member {Vector3}
     */
    this.diffuse = diffuse || new Vector3(0.3, 0.3, 0.3);

    /**
     * 单色高光
     * @member {Vector3}
     */
    this.specular = specular || new Vector3(0.5, 0.5, 0.5);

    /**
     * 环境光强度
     * @member {Number}
     */
    this.diffuseIntensity = diffuseIntensity === undefined ? 1 : diffuseIntensity;

    /**
     * 高光强度
     * @member {Number}
     */
    this.specularIntensity = specularIntensity === undefined ? 1 : specularIntensity;
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
    Matrix3x3.fromMat4(transformMatrix, cacheMat3);
    mtl.setValue(uniformName + ".transformMatrix", cacheMat3);
  }
}
