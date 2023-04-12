uniform mat4 galacean_VPMat;

attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;

varying vec2 v_uv;

void main()
{
  gl_Position = galacean_VPMat * vec4(POSITION, 1.0);
  v_uv = TEXCOORD_0;
}
