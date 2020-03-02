import { UniformSemantic, DataType, Logger } from "@alipay/o3-base";
import { AssetObject, ACamera } from "@alipay/o3-core";
import { ShaderFactory } from "@alipay/o3-shaderlib";
import { Material } from "./Material";
import { TechniqueStates, Attributes, Uniforms } from "./type";

/**
 * 渲染单个对象所需的控制对象，作为 Material 的模块使用。对应 glTF 里面的 technique 对象
 * @class
 */
export class RenderTechnique extends AssetObject {
  // 是否可用
  public isValid: boolean = false;
  // Unifrom记录数组
  private _uniforms: Uniforms = RenderTechnique.commonUniforms;
  // Attribute记录对象
  private _attributes: Attributes = RenderTechnique.commonAttributes;
  /**
   * 渲染状态控制对象
   * {
   *  enable:[],
   *  disable:[],
   *  functions:{
   *    "func_name":[]
   *  }
   * }
   *
   * function name: "blendColor", "blendEquationSeparate", "blendFuncSeparate",
   * "colorMask", "cullFace", "depthFunc", "depthMask", "depthRange", "frontFace",
   * "lineWidth", "polygonOffset", and "scissor"
   * @member {object}
   */
  public states: TechniqueStates = null;
  /**
   * Vertex Shader 代码
   * @member {string}
   */
  public vertexShader: string = "";
  /**
   * Fragment Shader 代码
   * @member {string}
   */
  public fragmentShader: string = "";

  /**
   * GLSL 原始版本
   * 若 WebGL 2 时着色器为旧版本，则升级到 300 版本
   * @member {String} - "100" | "300 es"
   */
  public version = "100";
  /**
   * Vertex Shader 的精度
   * @member {String}
   */
  public vertexPrecision = "highp";
  /**
   * Fragment Shader 的精度
   * @member {String}
   */
  public fragmentPrecision = "mediump";
  /**
   * 自定义宏
   * @member {Array}
   */
  public customMacros = [];

  /**
   * WebGL 1.0 时着色器中使用的拓展
   * @member {Array}
   */
  public shaderExtension100 = ["GL_EXT_shader_texture_lod", "GL_OES_standard_derivatives"];

  /**
   * WebGL 2.0 时着色器中使用的拓展
   * @member {Array}
   */
  public shaderExtension300 = [];

  public _needCompile = true;

  private _recreateHeader: boolean;
  private _vsHeader: string;
  private _vsCode: string;
  private _fsHeader: string;
  private _fsCode: string;
  private _fogMacro: string;
  public attribLocSet: any;

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor(name: string) {
    super(name);
  }

  get attributes() {
    return this._attributes;
  }

  set attributes(v) {
    this._attributes = Object.assign({}, RenderTechnique.commonAttributes, v);
  }

  get uniforms() {
    return this._uniforms;
  }

  set uniforms(v) {
    this._uniforms = Object.assign({}, RenderTechnique.commonUniforms, v);
  }

  compile(camera, component, primitive, material: Material) {
    this.parseFog(camera);

    if (this._needCompile) {
      const isWebGL2 = camera?.renderHardware?.isWebGL2;

      material.preCompile?.(this);

      const attribMacros = this.getAttributeDefines(camera, component, primitive, material);

      if (this._recreateHeader) {
        // reset configs
        this.attributes = this.attributes;
        this.uniforms = this.uniforms;
      }

      if (!this._vsHeader || this._recreateHeader)
        this._vsHeader =
          ShaderFactory.parseVersion(this.version) +
          ShaderFactory.parseShaderName((this.name || "VOID").toUpperCase() + "_VERT") +
          "\n" +
          ShaderFactory.parsePrecision(this.vertexPrecision) +
          "\n" +
          ShaderFactory.parseAttributeMacros(attribMacros) +
          "\n" +
          ShaderFactory.parseCustomMacros(this.customMacros) +
          "\n";

      if (!this._vsCode) this._vsCode = ShaderFactory.parseShader(this.vertexShader);

      this.vertexShader = this._vsHeader + this._vsCode;

      if (!this._fsHeader || this._recreateHeader)
        this._fsHeader =
          ShaderFactory.parseVersion(this.version) +
          ShaderFactory.parseShaderName((this.name || "VOID").toUpperCase() + "_FRAG") +
          "\n" +
          ShaderFactory.parseExtension(isWebGL2 ? this.shaderExtension300 : this.shaderExtension100) +
          ShaderFactory.parsePrecision(this.fragmentPrecision) +
          "\n" +
          ShaderFactory.parseAttributeMacros(attribMacros) +
          "\n" +
          ShaderFactory.parseCustomMacros(this.customMacros) +
          "\n";

      if (!this._fsCode) this._fsCode = ShaderFactory.parseShader(this.fragmentShader);

      this.fragmentShader = this._fsHeader + this._fsCode;

      /** 若 WebGL 2 时着色器为旧版本，则升级到 300 版本 */
      if (isWebGL2 && this.version !== "300 es") {
        this.vertexShader = ShaderFactory.convertTo300(this.vertexShader);
        this.fragmentShader = ShaderFactory.convertTo300(this.fragmentShader, true);
      }

      this._needCompile = false;
      this._recreateHeader = false;

      material.postCompile?.(this);
    }
  }

  getAttributeDefines(camera: ACamera, component, primitive, material) {
    const rhi = camera._rhi;
    const gl = rhi.gl;
    const _macros = [];
    if (!primitive) return _macros;

    const attribNames = Object.keys(primitive.vertexAttributes);

    _macros.push(`O3_VERTEX_PRECISION ${this.vertexPrecision}`);
    _macros.push(`O3_FRAGMENT_PRECISION ${this.fragmentPrecision}`);

    if (attribNames.indexOf("TEXCOORD_0") > -1) _macros.push("O3_HAS_UV");
    if (attribNames.indexOf("NORMAL") > -1) _macros.push("O3_HAS_NORMAL");
    if (attribNames.indexOf("TANGENT") > -1) _macros.push("O3_HAS_TANGENT");
    if (attribNames.indexOf("JOINTS_0") > -1) {
      _macros.push("O3_HAS_SKIN");
      if (component.jointNodes && component.jointNodes.length) {
        const maxAttribUniformVec4 = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
        const maxJoints = Math.floor((maxAttribUniformVec4 - 16) / 4);
        const joints = component.jointNodes.length;
        if (maxJoints < joints) {
          Logger.error(
            `component's joints count(${joints}) greater than device's MAX_VERTEX_UNIFORM_VECTORS number ${maxAttribUniformVec4}, suggest joint count less than ${maxJoints}.`,
            component
          );
        } else {
          // 使用最大关节数，保证所有 ASkinnedMeshRenderer 都可以共用材质
          _macros.push(`O3_JOINTS_NUM ${material.maxJointsNum}`);
        }
      }
    }
    if (attribNames.indexOf("COLOR_0") > -1) {
      _macros.push("O3_HAS_VERTEXCOLOR");
      if (primitive.vertexAttributes.COLOR_0.size === 4) _macros.push("O3_HAS_VERTEXALPHA");
    }

    if (component.weights) {
      const maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
      if (attribNames.length > maxAttribs) {
        Logger.warn(`too many morph targets, beyound the MAX_VERTEX_ATTRIBS limit ${maxAttribs}`);
      }
      const targetNum = component.weights.length;
      _macros.push("O3_HAS_MORPH");
      _macros.push(`O3_MORPH_NUM ${targetNum}`);

      if (attribNames.indexOf("POSITION_0") > -1) _macros.push("O3_MORPH_POSITION");
      if (attribNames.indexOf("NORMAL_0") > -1) _macros.push("O3_MORPH_NORMAL");
      if (attribNames.indexOf("TANGENT_0") > -1) _macros.push("O3_MORPH_TANGENT");

      this._attributes = Object.assign(this.attributes, this.createMorphConfig(primitive, targetNum));
      this._uniforms.u_morphWeights = {
        name: "u_morphWeights",
        semantic: UniformSemantic.MORPHWEIGHTS,
        type: DataType.FLOAT
      };
      // }
    }

    const scene = camera.scene as any;
    if (scene.hasFogFeature) {
      _macros.push(...scene.getFogMacro());
    }

    return _macros;
  }

  parseFog(camera) {
    const scene = camera.scene;
    if (scene.hasFogFeature) {
      const fogMacro = scene.getFogMacro();
      if (this._fogMacro !== fogMacro) {
        this._needCompile = true;
        this._recreateHeader = true;
        this.needRecreate = true;
        this._fogMacro = fogMacro;
      }
    }
  }

  createMorphConfig(primitive, targetNum: number) {
    const attributes = Object.keys(primitive.vertexAttributes);
    const morphConfig = {};
    for (let i = 0; i < targetNum; i++) {
      if (attributes.indexOf(`POSITION_${i}`) > -1)
        morphConfig[`a_position${i}`] = {
          name: `a_position${i}`,
          semantic: `POSITION_${i}`,
          type: DataType.FLOAT_VEC3
        };

      if (attributes.indexOf(`NORMAL_${i}`) > -1)
        morphConfig[`a_normal${i}`] = {
          name: `a_normal${i}`,
          semantic: `NORMAL_${i}`,
          type: DataType.FLOAT_VEC3
        };

      if (attributes.indexOf(`TANGENT_${i}`) > -1)
        morphConfig[`a_tangent${i}`] = {
          name: `a_tangent${i}`,
          semantic: `TANGENT_${i}`,
          type: DataType.FLOAT_VEC3
        };
    }

    return morphConfig;
  }

  static commonAttributes = {
    a_position: {
      name: "a_position",
      semantic: "POSITION",
      type: DataType.FLOAT_VEC3
    },
    a_uv: {
      name: "a_uv",
      semantic: "TEXCOORD_0",
      type: DataType.FLOAT_VEC2
    },
    a_normal: {
      name: "a_noraml",
      semantic: "NORMAL",
      type: DataType.FLOAT_VEC3
    },
    a_tangent: {
      name: "a_tangent",
      semantic: "TANGENT",
      type: DataType.FLOAT_VEC4
    },
    a_color: {
      name: "a_color",
      semantic: "COLOR_0",
      type: DataType.FLOAT_VEC4
    },
    a_joint: {
      name: "a_joint",
      semantic: "JOINTS_0",
      type: DataType.FLOAT_VEC4
    },
    a_weight: {
      name: "a_weight",
      semantic: "WEIGHTS_0",
      type: DataType.FLOAT_VEC4
    }
  };

  static commonUniforms = {
    u_localMat: {
      name: "u_localMat",
      semantic: UniformSemantic.LOCAL,
      type: DataType.FLOAT_MAT4
    },
    u_modelMat: {
      name: "u_modelMat",
      semantic: UniformSemantic.MODEL,
      type: DataType.FLOAT_MAT4
    },
    u_viewMat: {
      name: "u_viewMat",
      semantic: UniformSemantic.VIEW,
      type: DataType.FLOAT_MAT4
    },
    u_projMat: {
      name: "u_projMat",
      semantic: UniformSemantic.PROJECTION,
      type: DataType.FLOAT_MAT4
    },
    u_MVMat: {
      name: "u_MVMat",
      semantic: UniformSemantic.MODELVIEW,
      type: DataType.FLOAT_MAT4
    },
    u_MVPMat: {
      name: "u_MVPMat",
      semantic: UniformSemantic.MODELVIEWPROJECTION,
      type: DataType.FLOAT_MAT4
    },
    u_normalMat: {
      name: "u_normalMat",
      semantic: UniformSemantic.MODELINVERSETRANSPOSE,
      type: DataType.FLOAT_MAT3
    },
    u_cameraPos: {
      name: "u_cameraPos",
      type: DataType.FLOAT_VEC3,
      semantic: UniformSemantic.EYEPOS
    },
    u_time: {
      name: "u_time",
      type: DataType.FLOAT,
      semantic: UniformSemantic.TIME
    },
    u_jointMatrix: {
      name: "u_jointMatrix",
      semantic: UniformSemantic.JOINTMATRIX,
      type: DataType.FLOAT_MAT4
    },
    u_fogColor: {
      name: "u_fogColor",
      type: DataType.FLOAT_VEC3
    },
    u_fogDensity: {
      name: "u_fogDensity",
      type: DataType.FLOAT
    },
    u_fogNear: {
      name: "u_fogNear",
      type: DataType.FLOAT
    },
    u_fogFar: {
      name: "u_fogFar",
      type: DataType.FLOAT
    }
  };
}
