import { DataType, UniformSemantic } from '@alipay/o3-base';
import { ADirectLight } from '@alipay/o3-lighting';
import { Material, RenderTechnique } from '@alipay/o3-material';

import VertShaderSource from './Vert.glsl';
import FragShaderSource from './Frag.glsl';
console.log(VertShaderSource+' a ');


export class HatchingMaterial extends Material {
  constructor(name, mainLight) {
    super(name);

    const lgtUniforms = ADirectLight.getUniformDefine('u_mainLight');

    //--
    let tech = new RenderTechnique('hatching');
    tech.isValid = true;
    tech.vertexShader = HatchingMaterial.vertexShader;
    tech.fragmentShader = HatchingMaterial.fragmentShader;
    tech.attributes = HatchingMaterial.attributes;
    tech.uniforms = { ...HatchingMaterial.uniforms, ...lgtUniforms };
    this._technique = tech;

    this.mainLight = mainLight;
    this.texHatch0 = null;
    this.texHatch1 = null;
    this.texHatch2 = null;
    this.texHatch3 = null;
    this.texHatch4 = null;
    this.texHatch5 = null;

    this.titling = 1.0;
  }

  prepareDrawing(camera, component) {
    this.setValue('u_hatch0', this.texHatch0);
    this.setValue('u_hatch1', this.texHatch1);
    this.setValue('u_hatch2', this.texHatch2);
    this.setValue('u_hatch3', this.texHatch3);
    this.setValue('u_hatch4', this.texHatch4);
    this.setValue('u_hatch5', this.texHatch5);

    this.setValue('u_titling', this.titling);
    this.mainLight.bindMaterialValues(this, 'u_mainLight');

    super.prepareDrawing(camera, component);
  }
};

Object.assign(HatchingMaterial, {
  vertexShader: VertShaderSource,
  fragmentShader: FragShaderSource,
  attributes: {
    a_position: {
      name: 'a_position',
      semantic: 'POSITION',
      type: DataType.FLOAT_VEC3
    },
    a_normal: {
      name: 'a_normal',
      semantic: 'NORMAL',
      type: DataType.FLOAT_VEC3
    },
    a_uv: {
      name: 'a_uv',
      semantic: 'TEXCOORD_0',
      type: DataType.FLOAT_VEC2
    }
  },
  uniforms: {
    u_titling : {
      name:'u_titling',
      type:DataType.FLOAT
    },
    u_MVP: {
      name: 'u_MVP',
      semantic: UniformSemantic.MODELVIEWPROJECTION,
      type: DataType.FLOAT_MAT4,
    },
    u_model: {
      name: 'u_model',
      semantic: UniformSemantic.MODEL,
      type: DataType.FLOAT_MAT4,
    },
    u_modelInverseTranspose: {
      name: 'u_modelInverseTranspose',
      semantic: UniformSemantic.MODELINVERSETRANSPOSE,
      type: DataType.FLOAT_MAT3,
    },
    u_eyePos: {
      name: 'u_eyePos',
      semantic: UniformSemantic.EYEPOS,
      type: DataType.FLOAT_VEC3,
    },
    u_hatch0: {
      name: 'u_hatch0',
      type: DataType.SAMPLER_2D
    },
    u_hatch1: {
      name: 'u_hatch1',
      type: DataType.SAMPLER_2D
    },
    u_hatch2: {
      name: 'u_hatch2',
      type: DataType.SAMPLER_2D
    },
    u_hatch3: {
      name: 'u_hatch3',
      type: DataType.SAMPLER_2D
    },
    u_hatch4: {
      name: 'u_hatch4',
      type: DataType.SAMPLER_2D
    },
    u_hatch5: {
      name: 'u_hatch5',
      type: DataType.SAMPLER_2D
    }
  }
});
