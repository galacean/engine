export class LoaderUtil {
  /**
   * Load image buffer
   */
  static loadImageBuffer(imageBuffer: ArrayBuffer, type: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const blob = new window.Blob([imageBuffer], { type });
      const img = new Image();
      img.onerror = function () {
        reject(new Error("Failed to load image buffer"));
      };
      img.onload = function () {
        // Call requestAnimationFrame to avoid iOS's bug.
        requestAnimationFrame(() => {
          resolve(img);
          img.onload = null;
          img.onerror = null;
          img.onabort = null;
        });
      };
      img.crossOrigin = "anonymous";
      img.src = URL.createObjectURL(blob);
    });
  }
}
