import { isPowerOf2, resampleImage } from "./resampleImage";

export function loadImage(url, callback, crossOrigin = true, reSample = true, timeout?: number) {
  const img = new Image();

  let timer;

  if (timeout) {
    timer = setTimeout(() => {
      callback(new Error("Image load timeout " + url), null);
    }, timeout);
  }

  // resample none 2x image
  if (crossOrigin) {
    img.crossOrigin = "anonymous";
  }

  img.onerror = function() {
    if (timer) {
      clearTimeout(timer);
    }

    callback(new Error("Failed to load " + url), null);
  };

  img.onload = function() {
    if (timer) {
      clearTimeout(timer);
    }

    if (reSample && (!isPowerOf2(img.width) || !isPowerOf2(img.height))) {
      const potImage = new Image();
      potImage.onload = function() {
        callback(null, potImage);
      };

      potImage.src = resampleImage(img);
    } else {
      callback(null, img);
    }
  };
  img.src = url;
}
