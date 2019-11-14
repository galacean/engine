export function nearestPow2(n) {
  return Math.pow(2, Math.round(Math.log(n) / Math.log(2)));
}

export function isPowerOf2(n) {
  return n && (n & (n - 1)) === 0;
}

export function resampleImage(image) {
  const srcW = image.width;
  const srcH = image.height;

  const dstW = nearestPow2(srcW);
  const dstH = nearestPow2(srcH);

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, srcW, srcH, 0, 0, dstW, dstH);

  return canvas.toDataURL();
}
