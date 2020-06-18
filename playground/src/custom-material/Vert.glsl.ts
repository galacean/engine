export default `precision highp float;

//-- attributes
attribute vec3 a_position; 
attribute vec3 a_normal;
attribute vec2 a_uv;

//-- uniforms
uniform mat4 u_MVP;
uniform mat4 u_model;
uniform mat3 u_modelInverseTranspose;
uniform vec3 u_eyePos;
uniform float u_titling;

//-- varying
varying vec2 v_uv;
varying vec3 v_normal;
varying vec3 v_viewDir;

void main() {    
  gl_Position = u_MVP * vec4(a_position, 1.0);
  v_normal = u_modelInverseTranspose * a_normal;
  v_uv = a_uv*u_titling;

  vec3 worldPos = (u_model * vec4(a_position, 1.0)).xyz;
  v_viewDir = normalize(worldPos-u_eyePos);
}`