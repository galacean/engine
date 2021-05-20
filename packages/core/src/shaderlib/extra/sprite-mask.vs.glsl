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