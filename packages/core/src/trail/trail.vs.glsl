attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;

varying vec2 v_uv;

uniform mat4 galacean_ProjMat;
uniform mat4 galacean_ViewMat;

void main() {

  gl_Position = galacean_ProjMat * galacean_ViewMat * vec4( POSITION, 1.0 );
  v_uv = TEXCOORD_0;

}
