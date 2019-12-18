/**
 * 根据 uvTransform 设置 mat3
 * @param {mat3} out - 保存结果的矩阵
 * @param {Number} uOffset  - 纹理 U 方向的偏移
 * @param {Number} vOffset  - 纹理 V 方向的偏移
 * @param {Number} uScale  - 纹理 U 方向的缩放
 * @param {Number} vScale  - 纹理 V 方向的缩放
 * @param {Number} rotation  - 纹理旋转弧度 0～2PI
 * @param {Number[]} center  - 纹理中心点
 * */
export function fromUvTransform(out, uOffset, vOffset, uScale, vScale, rotation, center) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const centerX = center[0];
  const centerY = center[1];

  out[0] = uScale * cos;
  out[1] = -vScale * sin;
  out[2] = 0;
  out[3] = uScale * sin;
  out[4] = vScale * cos;
  out[5] = 0;
  out[6] = -uScale * (cos * centerX + sin * centerY) + centerX + uOffset;
  out[7] = -vScale * (-sin * centerX + cos * centerY) + centerY + vOffset;
  out[8] = 1;

  return out;
}
