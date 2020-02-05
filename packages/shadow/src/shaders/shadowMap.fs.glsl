precision mediump float;

/**
 * 分解保存深度值
*/
vec4 pack (float depth) {

  // 使用rgba 4字节共32位来存储z值,1个字节精度为1/256
  const vec4 bitShift = vec4(1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0);
  const vec4 bitMask = vec4(1.0/256.0, 1.0/256.0, 1.0/256.0, 0.0);

  vec4 rgbaDepth = fract(depth * bitShift); //计算每个点的z值

  // Cut off the value which do not fit in 8 bits
  rgbaDepth -= rgbaDepth.gbaa * bitMask;

  return rgbaDepth;
}

void main() {

  // 将z值分开存储到rgba分量中,阴影颜色的同时也是深度值z
  gl_FragColor = pack(gl_FragCoord.z);

}