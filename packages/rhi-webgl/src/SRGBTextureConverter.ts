import { Color } from "@galacean/engine-math";

/** Upload conversion for ordinary sRGB textures on WebGL1 without EXT_sRGB. */
export class SRGBTextureConverter {
  private static _decode: Uint8Array;
  private static _encode: Uint8Array;

  static decodePixels(
    source: ArrayBufferView,
    channels: number,
    pixelCount: number,
    sourceChannels = channels,
    destination?: Uint8Array
  ): Uint8Array {
    const input = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    if (input.length < pixelCount * sourceChannels) {
      throw new RangeError("Insufficient pixel data for sRGB texture upload.");
    }
    const output = destination ?? new Uint8Array(pixelCount * channels);
    const table = this._decode ?? (this._decode = this._createTable(Color.sRGBToLinearSpace));
    for (let i = 0, j = 0; i < output.length; i += channels, j += sourceChannels) {
      output[i] = table[input[j]];
      output[i + 1] = table[input[j + 1]];
      output[i + 2] = table[input[j + 2]];
      if (channels === 4) output[i + 3] = input[j + 3];
    }
    return output;
  }

  static encodePixels(output: ArrayBufferView, channels: number, pixelCount: number): void {
    const bytes = new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
    const table = this._encode ?? (this._encode = this._createTable(Color.linearToSRGBSpace));
    for (let i = 0, n = pixelCount * channels; i < n; i += channels) {
      bytes[i] = table[bytes[i]];
      bytes[i + 1] = table[bytes[i + 1]];
      bytes[i + 2] = table[bytes[i + 2]];
    }
  }

  static decodeImage(gl: WebGLRenderingContext, source: TexImageSource, channels: number) {
    const width =
      "videoWidth" in source
        ? source.videoWidth
        : "naturalWidth" in source
          ? source.naturalWidth
          : "displayWidth" in source
            ? source.displayWidth
            : source.width;
    const height =
      "videoHeight" in source
        ? source.videoHeight
        : "naturalHeight" in source
          ? source.naturalHeight
          : "displayHeight" in source
            ? source.displayHeight
            : source.height;
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const previousPackAlignment = gl.getParameter(gl.PACK_ALIGNMENT);
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    try {
      // Use the browser's upload path to preserve TexImageSource conversion, orientation
      // and premultiplied-alpha semantics (including ImageBitmap's own upload rules).
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("Unable to read image pixels for sRGB texture upload.");
      }
      const pixels = new Uint8Array(width * height * 4);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      // The readback buffer is owned here, so convert and compact it in place.
      const data = this.decodePixels(
        pixels,
        channels,
        width * height,
        4,
        pixels.subarray(0, width * height * channels)
      );
      return { data, width, height };
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
      gl.bindTexture(gl.TEXTURE_2D, previousTexture);
      gl.pixelStorei(gl.PACK_ALIGNMENT, previousPackAlignment);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    }
  }

  private static _createTable(convert: (value: number) => number): Uint8Array {
    const table = new Uint8Array(256);
    for (let i = 0; i < 256; i++) table[i] = Math.round(convert(i / 255) * 255);
    return table;
  }
}
