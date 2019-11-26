/**
 * TGA
 * @class
 * @private
 */
export class TGA {
  public header;
  public palette;
  public imageData;

  parseData(data) {
    let offset = 0;

    // Not enough data to contain header ?
    if (data.length < 0x12) {
      throw new Error("TGA::load() - Not enough data to contain header");
    }

    // Read TgaHeader
    this.header = {
      /* 0x00  BYTE */ idLength: data[offset++],
      /* 0x01  BYTE */ colorMapType: data[offset++],
      /* 0x02  BYTE */ imageType: data[offset++],
      /* 0x03  WORD */ colorMapIndex: data[offset++] | (data[offset++] << 8),
      /* 0x05  WORD */ colorMapLength: data[offset++] | (data[offset++] << 8),
      /* 0x07  BYTE */ colorMapDepth: data[offset++],
      /* 0x08  WORD */ offsetX: data[offset++] | (data[offset++] << 8),
      /* 0x0a  WORD */ offsetY: data[offset++] | (data[offset++] << 8),
      /* 0x0c  WORD */ width: data[offset++] | (data[offset++] << 8),
      /* 0x0e  WORD */ height: data[offset++] | (data[offset++] << 8),
      /* 0x10  BYTE */ pixelDepth: data[offset++],
      /* 0x11  BYTE */ flags: data[offset++]
    };

    // Set shortcut
    this.header.hasEncoding =
      this.header.imageType === TGA.Type.RLE_INDEXED ||
      this.header.imageType === TGA.Type.RLE_RGB ||
      this.header.imageType === TGA.Type.RLE_GREY;
    this.header.hasColorMap =
      this.header.imageType === TGA.Type.RLE_INDEXED || this.header.imageType === TGA.Type.INDEXED;
    this.header.isGreyColor = this.header.imageType === TGA.Type.RLE_GREY || this.header.imageType === TGA.Type.GREY;

    // Check if a valid TGA file (or if we can load it)
    TGA.checkHeader(this.header);

    // Move to data
    offset += this.header.idLength;
    if (offset >= data.length) {
      throw new Error("TGA::load() - No data");
    }

    // Read palette
    if (this.header.hasColorMap) {
      const colorMapSize = this.header.colorMapLength * (this.header.colorMapDepth >> 3);
      this.palette = data.subarray(offset, offset + colorMapSize);
      offset += colorMapSize;
    }

    const pixelSize = this.header.pixelDepth >> 3;
    const imageSize = this.header.width * this.header.height;
    const pixelTotal = imageSize * pixelSize;

    const imageData = null;
    // RLE encoded
    if (this.header.hasEncoding) {
      this.imageData = TGA.decodeRLE(data, offset, pixelSize, pixelTotal);
    }

    // RAW pixels
    else {
      this.imageData = data.subarray(offset, offset + (this.header.hasColorMap ? imageSize : pixelTotal));
    }

    return this.imageData;
  }

  /**
   * Check the header of TGA file to detect errors
   *
   * @param {object} tga header structure
   * @throws Error
   */
  static checkHeader(header) {
    // What the need of a file without data ?
    if (header.imageType === TGA.Type.NO_DATA) {
      throw new Error("TGA::checkHeader() - No data");
    }

    // Indexed type
    if (header.hasColorMap) {
      if (header.colorMapLength > 256 || header.colorMapSize !== 24 || header.colorMapType !== 1) {
        throw new Error("TGA::checkHeader() - Invalid colormap for indexed type");
      }
    } else {
      if (header.colorMapType) {
        throw new Error("TGA::checkHeader() - Why does the image contain a palette ?");
      }
    }

    // Check image size
    if (header.width <= 0 || header.height <= 0) {
      throw new Error("TGA::checkHeader() - Invalid image size");
    }

    // Check pixel size
    if (header.pixelDepth !== 8 && header.pixelDepth !== 16 && header.pixelDepth !== 24 && header.pixelDepth !== 32) {
      throw new Error('TGA::checkHeader() - Invalid pixel size "' + header.pixelDepth + '"');
    }
  }

  /**
   * Decode RLE compression
   *
   * @param {Uint8Array} data
   * @param {number} offset in data to start loading RLE
   * @param {number} pixel count
   * @param {number} output buffer size
   */
  static decodeRLE(data, offset, pixelSize, outputSize) {
    let pos, c, count, i;

    const output = new Uint8Array(outputSize);
    const pixels = new Uint8Array(pixelSize);
    pos = 0;

    while (pos < outputSize) {
      c = data[offset++];
      count = (c & 0x7f) + 1;

      // RLE pixels.
      if (c & 0x80) {
        // Bind pixel tmp array
        for (i = 0; i < pixelSize; ++i) {
          pixels[i] = data[offset++];
        }

        // Copy pixel array
        for (i = 0; i < count; ++i) {
          output.set(pixels, pos);
          pos += pixelSize;
        }
      }

      // Raw pixels.
      else {
        count *= pixelSize;
        for (i = 0; i < count; ++i) {
          output[pos++] = data[offset++];
        }
      }
    }

    return output;
  }

  /**
   * Return a ImageData object from a TGA file (8bits)
   *
   * @param {Array} imageData - ImageData to bind
   * @param {Array} indexes - index to colormap
   * @param {Array} colormap
   * @param {number} width
   * @param {number} y_start - start at y pixel.
   * @param {number} x_start - start at x pixel.
   * @param {number} y_step  - increment y pixel each time.
   * @param {number} y_end   - stop at pixel y.
   * @param {number} x_step  - increment x pixel each time.
   * @param {number} x_end   - stop at pixel x.
   * @returns {Array} imageData
   */
  static getImageData8bits(imageData, indexes, colormap, width, y_start, y_step, y_end, x_start, x_step, x_end) {
    let color, i, x, y;

    for (i = 0, y = y_start; y !== y_end; y += y_step) {
      for (x = x_start; x !== x_end; x += x_step, i++) {
        color = indexes[i];
        imageData[(x + width * y) * 4 + 3] = 255;
        imageData[(x + width * y) * 4 + 2] = colormap[color * 3 + 0];
        imageData[(x + width * y) * 4 + 1] = colormap[color * 3 + 1];
        imageData[(x + width * y) * 4 + 0] = colormap[color * 3 + 2];
      }
    }

    return imageData;
  }

  /**
   * Return a ImageData object from a TGA file (16bits)
   *
   * @param {Array} imageData - ImageData to bind
   * @param {Array} pixels data
   * @param {Array} colormap - not used
   * @param {number} width
   * @param {number} y_start - start at y pixel.
   * @param {number} x_start - start at x pixel.
   * @param {number} y_step  - increment y pixel each time.
   * @param {number} y_end   - stop at pixel y.
   * @param {number} x_step  - increment x pixel each time.
   * @param {number} x_end   - stop at pixel x.
   * @returns {Array} imageData
   */
  static getImageData16bits(imageData, pixels, colormap, width, y_start, y_step, y_end, x_start, x_step, x_end) {
    let color, i, x, y;

    for (i = 0, y = y_start; y !== y_end; y += y_step) {
      for (x = x_start; x !== x_end; x += x_step, i += 2) {
        color = pixels[i + 0] | (pixels[i + 1] << 8);
        imageData[(x + width * y) * 4 + 0] = (color & 0x7c00) >> 7;
        imageData[(x + width * y) * 4 + 1] = (color & 0x03e0) >> 2;
        imageData[(x + width * y) * 4 + 2] = (color & 0x001f) >> 3;
        imageData[(x + width * y) * 4 + 3] = color & 0x8000 ? 0 : 255;
      }
    }

    return imageData;
  }

  /**
   * Return a ImageData object from a TGA file (24bits)
   *
   * @param {Array} imageData - ImageData to bind
   * @param {Array} pixels data
   * @param {Array} colormap - not used
   * @param {number} width
   * @param {number} y_start - start at y pixel.
   * @param {number} x_start - start at x pixel.
   * @param {number} y_step  - increment y pixel each time.
   * @param {number} y_end   - stop at pixel y.
   * @param {number} x_step  - increment x pixel each time.
   * @param {number} x_end   - stop at pixel x.
   * @returns {Array} imageData
   */
  static getImageData24bits(imageData, pixels, colormap, width, y_start, y_step, y_end, x_start, x_step, x_end) {
    let i, x, y;

    for (i = 0, y = y_start; y !== y_end; y += y_step) {
      for (x = x_start; x !== x_end; x += x_step, i += 3) {
        imageData[(x + width * y) * 4 + 3] = 255;
        imageData[(x + width * y) * 4 + 2] = pixels[i + 0];
        imageData[(x + width * y) * 4 + 1] = pixels[i + 1];
        imageData[(x + width * y) * 4 + 0] = pixels[i + 2];
      }
    }

    return imageData;
  }

  /**
   * Return a ImageData object from a TGA file (32bits)
   *
   * @param {Array} imageData - ImageData to bind
   * @param {Array} pixels data
   * @param {Array} colormap - not used
   * @param {number} width
   * @param {number} y_start - start at y pixel.
   * @param {number} x_start - start at x pixel.
   * @param {number} y_step  - increment y pixel each time.
   * @param {number} y_end   - stop at pixel y.
   * @param {number} x_step  - increment x pixel each time.
   * @param {number} x_end   - stop at pixel x.
   * @returns {Array} imageData
   */
  static getImageData32bits(imageData, pixels, colormap, width, y_start, y_step, y_end, x_start, x_step, x_end) {
    let i, x, y;

    for (i = 0, y = y_start; y !== y_end; y += y_step) {
      for (x = x_start; x !== x_end; x += x_step, i += 4) {
        imageData[(x + width * y) * 4 + 2] = pixels[i + 0];
        imageData[(x + width * y) * 4 + 1] = pixels[i + 1];
        imageData[(x + width * y) * 4 + 0] = pixels[i + 2];
        imageData[(x + width * y) * 4 + 3] = pixels[i + 3];
      }
    }

    return imageData;
  }

  /**
   * Return a ImageData object from a TGA file (8bits grey)
   *
   * @param {Array} imageData - ImageData to bind
   * @param {Array} pixels data
   * @param {Array} colormap - not used
   * @param {number} width
   * @param {number} y_start - start at y pixel.
   * @param {number} x_start - start at x pixel.
   * @param {number} y_step  - increment y pixel each time.
   * @param {number} y_end   - stop at pixel y.
   * @param {number} x_step  - increment x pixel each time.
   * @param {number} x_end   - stop at pixel x.
   * @returns {Array} imageData
   */
  static getImageDataGrey8bits(imageData, pixels, colormap, width, y_start, y_step, y_end, x_start, x_step, x_end) {
    let color, i, x, y;

    for (i = 0, y = y_start; y !== y_end; y += y_step) {
      for (x = x_start; x !== x_end; x += x_step, i++) {
        color = pixels[i];
        imageData[(x + width * y) * 4 + 0] = color;
        imageData[(x + width * y) * 4 + 1] = color;
        imageData[(x + width * y) * 4 + 2] = color;
        imageData[(x + width * y) * 4 + 3] = 255;
      }
    }

    return imageData;
  }

  /**
   * Return a ImageData object from a TGA file (16bits grey)
   *
   * @param {Array} imageData - ImageData to bind
   * @param {Array} pixels data
   * @param {Array} colormap - not used
   * @param {number} width
   * @param {number} y_start - start at y pixel.
   * @param {number} x_start - start at x pixel.
   * @param {number} y_step  - increment y pixel each time.
   * @param {number} y_end   - stop at pixel y.
   * @param {number} x_step  - increment x pixel each time.
   * @param {number} x_end   - stop at pixel x.
   * @returns {Array} imageData
   */
  static getImageDataGrey16bits(imageData, pixels, colormap, width, y_start, y_step, y_end, x_start, x_step, x_end) {
    let i, x, y;

    for (i = 0, y = y_start; y !== y_end; y += y_step) {
      for (x = x_start; x !== x_end; x += x_step, i += 2) {
        imageData[(x + width * y) * 4 + 0] = pixels[i + 0];
        imageData[(x + width * y) * 4 + 1] = pixels[i + 0];
        imageData[(x + width * y) * 4 + 2] = pixels[i + 0];
        imageData[(x + width * y) * 4 + 3] = pixels[i + 1];
      }
    }

    return imageData;
  }

  /**
   * Return a ImageData object from a TGA file
   *
   * @param {object} imageData - Optional ImageData to work with
   * @returns {object} imageData
   */
  getImageData(imageData) {
    const width = this.header.width;
    const height = this.header.height;
    const origin = (this.header.flags & TGA.Origin.MASK) >> TGA.Origin.SHIFT;
    let x_start, x_step, x_end, y_start, y_step, y_end;
    let getImageData;

    // Create an imageData
    if (!imageData) {
      if (document) {
        imageData = document
          .createElement("canvas")
          .getContext("2d")
          .createImageData(width, height);
      }
      // In Thread context ?
      else {
        imageData = {
          width: width,
          height: height,
          data: new Uint8ClampedArray(width * height * 4)
        };
      }
    }

    if (origin === TGA.Origin.TOP_LEFT || origin === TGA.Origin.TOP_RIGHT) {
      y_start = 0;
      y_step = 1;
      y_end = height;
    } else {
      y_start = height - 1;
      y_step = -1;
      y_end = -1;
    }

    if (origin === TGA.Origin.TOP_LEFT || origin === TGA.Origin.BOTTOM_LEFT) {
      x_start = 0;
      x_step = 1;
      x_end = width;
    } else {
      x_start = width - 1;
      x_step = -1;
      x_end = -1;
    }

    // TODO: use this.header.offsetX and this.header.offsetY ?

    switch (this.header.pixelDepth) {
      case 8:
        getImageData = this.header.isGreyColor ? TGA.getImageDataGrey8bits : TGA.getImageData8bits;
        break;

      case 16:
        getImageData = this.header.isGreyColor ? TGA.getImageDataGrey16bits : TGA.getImageData16bits;
        break;

      case 24:
        getImageData = TGA.getImageData24bits;
        break;

      case 32:
        getImageData = TGA.getImageData32bits;
        break;
    }

    getImageData(imageData.data, this.imageData, this.palette, width, y_start, y_step, y_end, x_start, x_step, x_end);
    return imageData;
  }

  /**
   * Return a canvas with the TGA render on it
   *
   * @returns {object} CanvasElement
   */
  getCanvas() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(this.header.width, this.header.height);

    canvas.width = this.header.width;
    canvas.height = this.header.height;

    ctx.putImageData(this.getImageData(imageData), 0, 0);

    return canvas;
  }

  /**
   * Return a dataURI of the TGA file
   *
   * @param {string} type - Optional image content-type to output (default: image/png)
   * @returns {string} url
   */
  getDataURL(type?) {
    return this.getCanvas().toDataURL(type || "image/png");
  }

  static Type = {
    NO_DATA: 0,
    INDEXED: 1,
    RGB: 2,
    GREY: 3,
    RLE_INDEXED: 9,
    RLE_RGB: 10,
    RLE_GREY: 11
  };

  static Origin = {
    BOTTOM_LEFT: 0x00,
    BOTTOM_RIGHT: 0x01,
    TOP_LEFT: 0x02,
    TOP_RIGHT: 0x03,
    SHIFT: 0x04,
    MASK: 0x30
  };
}
