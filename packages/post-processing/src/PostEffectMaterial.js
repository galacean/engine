import { DataType, RenderState, ShaderFactory,Material,RenderTechnique } from '@alipay/o3';
import VertShaderSource from './shaders/PostRenderPass.glsl';

const VERT_ATTRIBUTES = {
  a_position: {
    name: 'a_position',
    semantic: 'POSITION',
    type: DataType.FLOAT_VEC2
  },
  a_uv: {
    name: 'a_uv',
    semantic: 'TEXCOORD_0',
    type: DataType.FLOAT_VEC2
  }
};

const RENDER_STATES = {
  disable: [
    RenderState.CULL_FACE,
    RenderState.DEPTH_TEST
  ],
  functions: {
    depthMask: [ false ]
  }
};

/**
 * 后处理所使用的特殊材质：使用指定的 Fragment Shader 绘制一个全屏的矩形
 * @private
 */
export class PostEffectMaterial extends Material{

  /**
   * 构造函数
   * @param {string} effectName 名称
   * @param {object} shaderConfig Technique 中的 Fragment 配置
   * @property {object} shaderConfig.uniforms Fragment Shader 所需的 Unifrom 配置(格式与 Technique 相同)
   * @property {object} shaderConfig.macros Fragment Shader 所需的宏定义
   * @property {string} shaderConfig.fragmentShader Fragment Shader 代码文本
   *
   */
  constructor( effectName, shaderConfig ){

    super( 'mtl_' + effectName );

    this._technique = this._createTech( effectName, shaderConfig );

  }

  _createTech( effectName, shaderConfig ){

    const tech = new RenderTechnique( 'tech_' + effectName );
    tech.isValid = true;

    // Uniforms (顶点 Shader 没有 uniform)
    tech.uniforms = shaderConfig.uniforms;

    // 顶点 Shader
    tech.vertexShader = shaderConfig.vertexShader || VertShaderSource;

    // Fragment Shader
    const fragmentShader = ShaderFactory.parseShader( shaderConfig.source );
    if( shaderConfig.macros ){

      let defines = '';
      for( const def in shaderConfig.macros ){

        defines += `#define ${def} ${shaderConfig.macros[def]}\r\n`;

      }
      tech.fragmentShader = defines + fragmentShader;

    }
    else{

      tech.fragmentShader = fragmentShader;

    }

    // 内部使用的 Quad 所需要的顶点属性
    tech._attributes = VERT_ATTRIBUTES;

    // 默认的渲染状态
    tech.states = RENDER_STATES;

    return tech;

  }


};
