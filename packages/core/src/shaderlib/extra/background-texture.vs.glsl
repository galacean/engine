attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;
varying vec2 v_uv;
uniform vec4 camera_ProjectionParams;

void main() {
  gl_Position = vec4(POSITION, 1.0);
  gl_Position.y *= camera_ProjectionParams.x;
  
  v_uv = TEXCOORD_0;
}