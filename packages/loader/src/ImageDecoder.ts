import { AssetPromise, Platform, SystemInfo } from "@galacean/engine-core";

/**
 * Decodes encoded image bytes (PNG, JPEG, WebP, ...) into an image element.
 *
 * The blob handed to the image carries the declared `mimeType` or the MIME type detected from the bytes:
 * browsers sniff an untyped blob, but some platforms (for example mini-game runtimes) only decode images
 * whose type is declared.
 * @internal
 */
export class ImageDecoder {
  static _decode(data: ArrayBuffer | ArrayBufferView, url: string, mimeType?: string): AssetPromise<HTMLImageElement> {
    return new AssetPromise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(
        new Blob([data as BlobPart], { type: mimeType || ImageDecoder._getMimeType(data) })
      );
      const image = new Image();
      image.onload = () => {
        const complete = () => {
          ImageDecoder._releaseObjectUrl(image, objectUrl);
          resolve(image);
        };
        if (
          (SystemInfo.platform === Platform.IPhone || SystemInfo.platform === Platform.IPad) &&
          typeof requestAnimationFrame !== "undefined"
        ) {
          // Defer on iOS WebKit so the decoded image surface is ready before revoking the blob URL.
          requestAnimationFrame(complete);
        } else {
          complete();
        }
      };
      image.onerror = image.onabort = () => {
        ImageDecoder._releaseObjectUrl(image, objectUrl);
        reject(new Error(`TextureLoader: failed to decode texture "${url}" (${data.byteLength} bytes).`));
      };
      image.crossOrigin = "anonymous";
      image.src = objectUrl;
    });
  }

  private static _getMimeType(data: ArrayBuffer | ArrayBufferView): string {
    const bytes =
      data instanceof Uint8Array
        ? data
        : ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : new Uint8Array(data);
    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return "image/png";
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    // "RIFF" .... "WEBP"
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
    return "";
  }

  private static _releaseObjectUrl(image: HTMLImageElement, objectUrl: string): void {
    image.onload = null;
    image.onerror = null;
    image.onabort = null;
    URL.revokeObjectURL(objectUrl);
  }
}
