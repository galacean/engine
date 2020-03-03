import { MaterialType, DataType, UniformSemantic, RenderState, BlendFunc } from '@alipay/o3-base';
import { Material, RenderTechnique } from '@alipay/o3-material';

const VERT_SHADER = `
  uniform mat4 matModelViewProjection;

  attribute vec3 a_position;
  attribute vec4 a_color;
  attribute vec2 a_uv;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vUv = a_uv;
    vColor = a_color;
    gl_Position = matModelViewProjection * vec4(a_position, 1.0);
  }
`;

const FRAG_SHADER = `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vColor;
  void main(void) {
    gl_FragColor = texture2D(map, vUv) * vColor;
  }
`;

export class SkeletonMeshMaterial extends Material {

  /**
   * 生成内部所使用的 Technique 对象
   * @private
   */
  _generateTechnique( camera, component ) {

    const customMacros = [];
    const uniforms = this.generateUniform();
    const attributes = this.generateAttributes();

    //--
    const tech = new RenderTechnique( this.name );
    tech.isValid = true;
    tech.uniforms = uniforms;
    tech.attributes = attributes;
    tech.customMacros = customMacros;
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;
    tech.states = {
      disable: [
        RenderState.CULL_FACE
      ],
      enable: [ RenderState.BLEND ],
      functions: {
        blendFuncSeparate: [ 
          BlendFunc.SRC_ALPHA, 
          BlendFunc.ONE_MINUS_SRC_ALPHA, 
          BlendFunc.ONE, 
          BlendFunc.ONE_MINUS_SRC_ALPHA
        ],
      }
    };

    this._technique = tech;
    this.renderType = MaterialType.TRANSPARENT;
  }

  prepareDrawing( camera, component, primitive ) {

    if ( !this._technique ) {

      this._generateTechnique(  camera, component );

    }

    super.prepareDrawing( camera, component, primitive );

  }

  generateAttributes() {
    const attributes = {
      a_position: {
        name: 'a_position',
        semantic: 'POSITION',
        type: DataType.FLOAT_VEC3
      },
      a_color: {
        name: 'a_color',
        semantic: 'COLOR',
        type: DataType.FLOAT_VEC4
      },
      a_uv: {
        name: 'a_uv',
        semantic: 'TEXCOORD_0',
        type: DataType.FLOAT_VEC2
      },
    };
    return attributes;
  }

  generateUniform() {
    const uniforms = {
      map: {
        name: 'map',
        type: DataType.SAMPLER_2D,
      },
      matModelViewProjection: {
        name: 'matModelViewProjection',
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4,
      },
    };
    return uniforms;
  }

  set map( v ) {
    this.setValue('map', v);
  }
  get map() {
    return this.getValue('map');
  }

}
