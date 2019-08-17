'use strict';

import { DataType, UniformSemantic, RenderState, BlendFunc } from '@alipay/o3-base';

const SpriteVertShader = `
precision highp float;

uniform mat4 matProjection;
uniform mat4 matView;

attribute vec3 a_pos;
attribute vec2 a_uv;
attribute vec4 a_color;

varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  gl_Position = matProjection * matView * vec4(a_pos,1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

const SpriteFragmentShader = `
precision mediump float;
precision mediump int;

uniform sampler2D s_diffuse;
varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  // 只使用贴图的Alpha做Mask，这样Tint Color依然可以控制控件Fade Out
  vec4 baseColor = texture2D(s_diffuse, v_uv);
  gl_FragColor = baseColor * v_color;
}
`;

export const SpriteTechnique = {
  name: 'spriteTech3D',
  vertexShader: SpriteVertShader,
  fragmentShader: SpriteFragmentShader,
  attribLocSet: {
    a_pos: 0,
    a_uv: 1,
    a_color: 2
  },
  attributes: {
    a_pos:{
      name: 'a_pos',
      semantic: 'POSITION',
      type: DataType.FLOAT_VEC3
    },
    a_uv:{
      name: 'a_uv',
      semantic: 'TEXCOORD_0',
      type: DataType.FLOAT_VEC2
    },
    a_color: {
      name: 'a_color',
      semantic: 'COLOR',
      type: DataType.FLOAT_VEC3
    }
  },
  uniforms: {
    matProjection: {
      name: 'matProjection',
      semantic: UniformSemantic.PROJECTION,
      type: DataType.FLOAT_MAT4,
    },
    matView: {
      name: 'matView',
      semantic: UniformSemantic.VIEW,
      type: DataType.FLOAT_MAT4,
    },
    s_diffuse: {
      name: 's_diffuse',
      type: DataType.SAMPLER_2D
    }
  },
  states: {
    disable: [ RenderState.CULL_FACE ],
    enable: [ RenderState.BLEND ],
    functions: {
      blendFunc: [ BlendFunc.SRC_ALPHA, BlendFunc.ONE_MINUS_SRC_ALPHA ],
      depthMask: [ false ]//[gl.FALSE]
    }
  }

};

export function createSpriteMaterial() {

  const values = {};
  return {
    values,

    setValue: ( key, val ) =>{

      values[key] = val;

    },
    getValue: ( key ) =>{

      return values[key];

    }
  };

}
