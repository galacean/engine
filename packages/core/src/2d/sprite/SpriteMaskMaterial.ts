"use strict";

import { Shader } from "../../shader";

const spriteVertShader = `
precision highp float;

uniform mat4 u_VPMat;

attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;

varying vec2 v_uv;

void main()
{
  gl_Position = u_VPMat * vec4(POSITION, 1.0);
  v_uv = TEXCOORD_0;
}
`;

const spriteFragmentShader = `
precision mediump float;
precision mediump int;

uniform sampler2D u_texture;
uniform float u_alphaCutoff;
varying vec2 v_uv;

void main()
{
  vec4 color = texture2D(u_texture, v_uv);
  if (color.a < u_alphaCutoff) {
    discard;
  }

  gl_FragColor = color;
}
`;

Shader.create("SpriteMask", spriteVertShader, spriteFragmentShader);
