attribute vec3 a_position;
attribute vec2 a_uv;

varying vec2 v_uv;

uniform mat4 u_projMat;
uniform mat4 u_viewMat;

void main() {

  gl_Position = u_projMat * u_viewMat * vec4( a_position, 1.0 );
  v_uv = a_uv;

}
