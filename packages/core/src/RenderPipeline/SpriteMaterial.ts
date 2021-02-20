"use strict";

import { Shader } from "../shader";

const spriteVertShader = `
precision highp float;

uniform mat4 matProjection;
uniform mat4 matView;

attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;
attribute vec4 COLOR_0;

varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  gl_Position = matProjection * matView * vec4(POSITION,1.0);
  v_uv = TEXCOORD_0;
  v_color = COLOR_0;
}
`;

const spriteFragmentShader = `
precision mediump float;
precision mediump int;

uniform sampler2D s_diffuse;
varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  // Only use the Alpha of the texture as a mask, so that the tint color can still be controlled to fade out.
  vec4 baseColor = texture2D(s_diffuse, v_uv);
  gl_FragColor = baseColor * v_color;
}
`;

Shader.create("Sprite", spriteVertShader, spriteFragmentShader);
