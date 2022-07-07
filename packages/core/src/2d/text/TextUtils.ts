import { CharInfo } from "../assembler/CharInfo";
import { FontStyle } from "../enums/FontStyle";

/**
 * @internal
 * TextUtils includes some helper function for text.
 */
export class TextUtils {
  /** @internal */
  static _genericFontFamilies: Array<string> = [
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "math",
    "emoji",
    "fangsong"
  ];
  /** These characters are all tall to help calculate the height required for text. */
  private static _measureString: string = "|ÉqÅ";
  private static _measureBaseline: string = "M";
  private static _heightMultiplier: number = 2;
  private static _baselineMultiplier: number = 1.4;
  private static _fontSizeInfoCache: Record<string, FontSizeInfo> = {};
  private static _textContext: TextContext = null;

  /**
   * The instance function to get an object includes 2d context and canvas.
   * @returns the TextContext object
   */
  static textContext(): TextContext {
    let { _textContext: textContext } = TextUtils;
    if (!textContext) {
      let canvas: HTMLCanvasElement | OffscreenCanvas;
      try {
        canvas = new OffscreenCanvas(0, 0);
      } catch {
        canvas = document.createElement("canvas");
      }
      const context = canvas.getContext("2d");
      textContext = { canvas, context };
      TextUtils._textContext = textContext;
    }
    return textContext;
  }

  /**
   * Measure the font.
   * @param fontString - the string of the font
   * @returns the font size info
   */
  static measureFont(fontString: string): FontSizeInfo {
    const { _fontSizeInfoCache: fontSizeInfoCache } = TextUtils;
    let info = fontSizeInfoCache[fontString];
    if (info) {
      return info;
    }

    info = <FontSizeInfo>TextUtils._measureFontOrChar(fontString);
    fontSizeInfoCache[fontString] = info;
    return info;
  }

  /**
   * Get native font string.
   * @param fontName - The font name
   * @param fontSize - The font size
   * @param style - The font style
   * @returns The native font string
   */
  static getNativeFontString(fontName: string, fontSize: number, style: FontStyle): string {
    let str = style & FontStyle.Bold ? "bold " : "";
    style & FontStyle.Italic && (str += "italic ");
    // Check if font already contains strings
    if (!/([\"\'])[^\'\"]+\1/.test(fontName) && TextUtils._genericFontFamilies.indexOf(fontName) == -1) {
      fontName = `"${fontName}"`;
    }
    str += `${fontSize}px ${fontName}`;
    return str;
  }

  static measureChar(char: string, fontString: string): CharInfo {
    return <CharInfo>TextUtils._measureFontOrChar(fontString, char);
  }

  /**
   * Get native font hash.
   * @param fontName - The font name
   * @param fontSize - The font size
   * @param style - The font style
   * @returns The native font hash
   */
  static getNativeFontHash(fontName: string, fontSize: number, style: FontStyle): string {
    let str = style & FontStyle.Bold ? "bold" : "";
    style & FontStyle.Italic && (str += "italic");
    // Check if font already contains strings
    if (!/([\"\'])[^\'\"]+\1/.test(fontName) && TextUtils._genericFontFamilies.indexOf(fontName) == -1) {
      fontName = `${fontName}`;
    }
    str += `${fontSize}px${fontName}`;
    return str;
  }

  /**
   * Update canvas with the data.
   * @param width - the new width of canvas
   * @param height - the new height of canvas
   * @param data - the new data of canvas
   * @returns the canvas after update
   */
  static updateCanvas(width: number, height: number, data: ImageData): HTMLCanvasElement | OffscreenCanvas {
    const { canvas, context } = TextUtils.textContext();
    canvas.width = width;
    canvas.height = height;
    context.putImageData(data, 0, 0);
    return canvas;
  }

  private static _measureFontOrChar(fontString: string, char: string = ""): FontSizeInfo | CharInfo {
    const { canvas, context } = TextUtils.textContext();
    context.font = fontString;
    const measureString = char || TextUtils._measureString;
    const width = context.measureText(measureString).width;
    let baseline = Math.ceil(context.measureText(TextUtils._measureBaseline).width);
    const height = baseline * TextUtils._heightMultiplier;
    baseline = (TextUtils._baselineMultiplier * baseline) | 0;

    canvas.width = width;
    canvas.height = height;

    context.font = fontString;
    context.fillStyle = "#000";
    context.clearRect(0, 0, width, height);
    context.textBaseline = "middle";
    context.fillStyle = "#fff";
    context.fillText(measureString, 0, baseline);

    const imageData = context.getImageData(0, 0, width, height).data;
    const len = imageData.length;

    let top = -1;
    let bottom = -1;
    let y;
    let ascent = 0;
    let descent = 0;
    let size = 0;

    const integerW = canvas.width;
    for (let i = 0; i < len; i += 4) {
      if (imageData[i + 3] !== 0) {
        const idx = i / 4;
        y = ~~(idx / integerW);

        if (top === -1) {
          top = y;
        }

        if (y > bottom) {
          bottom = y;
        }
      }
    }

    if (top !== -1 && bottom !== -1) {
      ascent = baseline - top;
      descent = bottom - baseline + 1;
      size = ascent + descent;
    }
    const sizeInfo = { ascent, descent, size };

    if (char) {
      if (size > 0) {
        const data = context.getImageData(0, top, width, size);
        TextUtils.updateCanvas(width, size, data);
      }
      return {
        x: 0,
        y: 0,
        w: width,
        h: size,
        offsetX: 0,
        offsetY: (ascent - descent) * 0.5,
        xAdvance: width,
        u0: 0,
        v0: 0,
        u1: 0,
        v1: 0,
        ascent,
        descent,
        index: 0
      };
    } else {
      return sizeInfo;
    }
  }
}

/**
 * @internal
 * TextContext.
 */
export interface TextContext {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

/**
 * @internal
 * FontSizeInfo.
 */
export interface FontSizeInfo {
  ascent: number;
  descent: number;
  size: number;
}

/**
 * @internal
 * TextMetrics.
 */
export interface TextMetrics {
  width: number;
  height: number;
  lines: Array<string>;
  lineWidths: Array<number>;
  lineHeight: number;
  lineMaxSizes?: Array<FontSizeInfo>;
}
