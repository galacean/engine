#version 300 es
precision highp float;
precision highp int;

in vec3 a_sample;
flat out ivec2 v_texelCoordinate;

void main() {
  gl_Position = vec4(a_sample.x, 0.0, 0.0, 1.0);
  gl_PointSize = 1.0;
  v_texelCoordinate = ivec2(a_sample.yz);
}
