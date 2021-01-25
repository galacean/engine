attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;

varying vec2 v_uv;

uniform mat4 u_projMat;
uniform mat4 u_viewMat;

void main() {

  gl_Position = u_projMat * u_viewMat * vec4( POSITION, 1.0 );
  v_uv = TEXCOORD_0;

}
