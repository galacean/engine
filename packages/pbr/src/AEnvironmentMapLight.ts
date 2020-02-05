import { DataType } from "@alipay/o3-base";
import { ALight } from "@alipay/o3-lighting";
import { TextureCubeMap, Texture2D } from "@alipay/o3-material";

/**
 * 环境光源
 */
class AEnvironmentMapLight extends ALight {
  public diffuseMap;
  public specularMap;
  public diffuse;
  public specular;
  public diffuseIntensity;
  public specularIntensity;

  /**
   * 环境光源
   * @param {Node} node 节点对象
   * @param {Object} props 包含以下参数
   * @param {TextureCubeMap} [props.diffuseMap=undefined] 环境光贴图
   * @param {TextureCubeMap} [props.specularMap=undefined] 高光贴图
   * @param {Array} [props.diffuse=[0.3,0.3,0.3]] 单色环境光，当环境光贴图不存在时使用
   * @param {Array} [props.specular=[0.5,0.5,0.5]] 单色高光，当高光贴图不存在时使用
   * @param {Number} [props.diffuseIntensity=1] 环境光强度
   * @param {Number} [props.specularIntensity=1] 高光强度
   */
  constructor(node, props) {
    super(node);

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
     * @member {Array}
     */
    this.diffuse = diffuse || [0.3, 0.3, 0.3];

    /**
     * 单色高光
     * @member {Array}
     */
    this.specular = specular || [0.5, 0.5, 0.5];

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
   * 设置Values到材质
   * @param {Material} mtl 材质
   * @private
   */
  bindMaterialValues(mtl) {
    mtl.setValue("u_diffuseEnvSamplerIntensity", this.diffuseIntensity);
    mtl.setValue("u_specularEnvSamplerIntensity", this.specularIntensity);

    if (this.useDiffuseMap) {
      mtl.setValue("u_diffuseEnvSampler", this.diffuseMap);
    } else {
      mtl.setValue("u_diffuse", this.diffuse);
    }

    if (this.useSpecularMap) {
      mtl.setValue("u_specularEnvSampler", this.specularMap);
      mtl.setValue("u_mipMapLevel", this.specularMap.mipMapLevel);
    } else {
      mtl.setValue("u_specular", this.specular);
    }
  }

  /**
   * Uniform 配置
   * @private
   */
  static UNIFORM_DEFINE = {
    u_diffuseEnvSampler: {
      name: "u_diffuseEnvSampler",
      type: DataType.SAMPLER_CUBE
    },

    u_specularEnvSampler: {
      name: "u_specularEnvSampler",
      type: DataType.SAMPLER_CUBE
    },

    u_diffuse: {
      name: "u_diffuse",
      type: DataType.FLOAT_VEC3
    },

    u_specular: {
      name: "u_specular",
      type: DataType.FLOAT_VEC3
    },

    u_mipMapLevel: {
      name: "u_mipMapLevel",
      type: DataType.FLOAT
    },

    u_specularEnvSamplerIntensity: {
      name: "u_specularEnvSamplerIntensity",
      type: DataType.FLOAT
    },

    u_diffuseEnvSamplerIntensity: {
      name: "u_diffuseEnvSamplerIntensity",
      type: DataType.FLOAT
    }
  };
}

export { AEnvironmentMapLight };
