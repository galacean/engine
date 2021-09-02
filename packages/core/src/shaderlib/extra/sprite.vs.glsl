precision highp float;

#ifdef USE_MODEL_MATRIX
uniform mat4 u_MVPMat;
#else
uniform mat4 u_VPMat;
#endif

attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;
attribute vec4 COLOR_0;

varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  #ifdef USE_MODEL_MATRIX
  gl_Position = u_MVPMat * vec4(POSITION, 1.0);
  #else
  gl_Position = u_VPMat * vec4(POSITION, 1.0);
  #endif

  v_uv = TEXCOORD_0;
  v_color = COLOR_0;
}