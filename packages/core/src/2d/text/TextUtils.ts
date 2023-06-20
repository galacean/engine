import { Vector2 } from "@oasis-engine/math";
import { FontStyle } from "../enums/FontStyle";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";

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
 * TextMetrics.
 */
export interface TextMetrics {
  width: number;
  height: number;
  lines: Array<string>;
  lineWidths: Array<number>;
  lineHeight: number;
}

/**
 * @internal
 * TextUtils includes some helper function for text.
 */
export class TextUtils {
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
  private static _maxWidth: number = 2048;
  private static _maxHeight: number = 2048;
  private static _pixelsPerUnit: number = 128;
  private static _fontSizeCache: Record<string, number> = {};
  private static _textContext: TextContext = null;
  private static _tempVec2: Vector2 = new Vector2();

  /**
   * The instance function to get an object includes 2d context and canvas.
   * @returns the TextContext object
   */
  public static textContext(): TextContext {
    let { _textContext: textContext } = TextUtils;
    if (!textContext) {
      let canvas: HTMLCanvasElement | OffscreenCanvas;
      canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      textContext = { canvas, context };
      TextUtils._textContext = textContext;
    }
    return textContext;
  }

  /**
   * Measure the font.
   * @param font - the string of the font
   * @returns the font size
   */
  public static measureFont(font: string): number {
    const { _fontSizeCache: fontSizeCache } = TextUtils;
    let fontSize = fontSizeCache[font];
    if (fontSize) {
      return fontSize;
    }

    const { canvas, context } = TextUtils.textContext();
    context.font = font;
    const measureString = TextUtils._measureString;
    const width = Math.ceil(context.measureText(measureString).width);
    let baseline = Math.ceil(context.measureText(TextUtils._measureBaseline).width);
    const height = baseline * TextUtils._heightMultiplier;
    baseline = (TextUtils._baselineMultiplier * baseline) | 0;

    canvas.width = width;
    canvas.height = height;

    context.font = font;
    context.fillStyle = "#000";
    context.clearRect(0, 0, width, height);
    context.textBaseline = "alphabetic";
    context.fillStyle = "#f00";
    context.fillText(measureString, 0, baseline);

    const imgData = context.getImageData(0, 0, width, height).data;
    const lineDataCount = width * 4;
    let stop = false;
    let i = 0;
    let offset = 0;

    for (i = 0; i < baseline; ++i) {
      offset = i * lineDataCount;
      for (let j = 0; j < lineDataCount; j += 4) {
        if (imgData[offset + j] !== 0) {
          stop = true;
          break;
        }
      }
      if (stop) {
        break;
      }
    }

    const ascent = baseline - i;
    stop = false;

    for (i = height - 1; i >= baseline; --i) {
      offset = i * lineDataCount;
      for (let j = 0; j < lineDataCount; j += 4) {
        if (imgData[offset + j] !== 0) {
          stop = true;
          break;
        }
      }
      if (stop) {
        break;
      }
    }

    const descent = i - baseline + 1;
    fontSize = ascent + descent;
    fontSizeCache[font] = fontSize;
    return fontSize;
  }

  /**
   * Measure the text.
   * @param text - rendering string
   * @param originWidth - the width of the TextRenderer
   * @param originHeight - the height of the TextRenderer
   * @param lineSpacing - the space between two lines
   * @param enableWrapping - whether wrap text to next line when exceeds the width of the container
   * @param overflowMode - the overflow mode
   * @param fontString - the font string
   * @returns the TextMetrics object
   */
  public static measureText(
    text: string,
    originWidth: number,
    originHeight: number,
    lineSpacing: number,
    enableWrapping: boolean,
    overflowMode: OverflowMode,
    fontString: string
  ): TextMetrics {
    const { _pixelsPerUnit } = TextUtils;
    const fontSize = TextUtils.measureFont(fontString);
    const context = TextUtils.textContext().context;
    const lines = TextUtils._wordWrap(text, originWidth, enableWrapping, fontString);
    const lineCount = lines.length;
    const lineWidths = new Array<number>();
    const lineHeight = fontSize + lineSpacing * _pixelsPerUnit;
    context.font = fontString;
    // Calculate max width of all lines.
    let width = 0;
    for (let i = 0; i < lineCount; ++i) {
      const lineWidth = Math.ceil(context.measureText(lines[i]).width);
      if (lineWidth > width) {
        width = lineWidth;
      }
      lineWidths.push(lineWidth);
    }

    // Reset width and height.
    let height = originHeight * _pixelsPerUnit;
    if (overflowMode === OverflowMode.Overflow) {
      height = Math.min(lineHeight * lineCount, TextUtils._maxHeight);
    }

    return {
      width,
      height,
      lines,
      lineWidths,
      lineHeight
    };
  }

  /**
   * Trim canvas.
   * @returns the width and height after trim, and the image data
   */
  public static trimCanvas(): { width: number; height: number; data?: ImageData } {
    // https://gist.github.com/remy/784508

    const { canvas, context } = TextUtils.textContext();
    let { width, height } = canvas;

    const imageData = context.getImageData(0, 0, width, height).data;
    const len = imageData.length;

    let top = -1;
    let bottom = -1;
    let left = width;
    let right = -1;
    let data = null;
    let x;
    let y;

    for (let i = 0; i < len; i += 4) {
      if (imageData[i + 3] !== 0) {
        const idx = i / 4;
        x = idx % width;
        y = ~~(idx / width);

        if (top === -1) {
          top = y;
        }

        if (x < left) {
          left = x;
        }

        if (x > right) {
          right = x;
        }

        if (y > bottom) {
          bottom = y;
        }
      }
    }

    if (top !== -1) {
      top = Math.max(0, top - 1);
      bottom = Math.min(height - 1, bottom + 1);
      left = Math.max(0, left - 1);
      right = Math.min(width - 1, right + 1);
      width = right - left + 1;
      height = bottom - top + 1;
      data = context.getImageData(left, top, width, height);
    }

    return {
      width,
      height,
      data
    };
  }

  /**
   * Get native font string.
   * @param fontName - The font name
   * @param fontSize - The font size
   * @param style - The font style
   * @returns The native font string
   */
  public static getNativeFontString(fontName: string, fontSize: number, style: FontStyle): string {
    let str = style & FontStyle.Bold ? "bold " : "";
    style & FontStyle.Italic && (str += "italic ");
    // Check if font already contains strings
    if (!/([\"\'])[^\'\"]+\1/.test(fontName) && TextUtils._genericFontFamilies.indexOf(fontName) == -1) {
      fontName = `"${fontName}"`;
    }
    str += `${fontSize}px ${fontName}`;
    return str;
  }

  /**
   * Update text.
   * @param textMetrics - the text metrics object
   * @param fontStr - the font string
   * @param horizontalAlignment - the horizontal alignment
   * @param verticalAlignment - the vertical alignment
   */
  public static updateText(
    textMetrics: TextMetrics,
    fontStr: string,
    horizontalAlignment: TextHorizontalAlignment,
    verticalAlignment: TextVerticalAlignment
  ): void {
    const { canvas, context } = TextUtils.textContext();
    const { width, height } = textMetrics;
    // reset canvas's width and height.
    canvas.width = width;
    canvas.height = height;
    // clear canvas.
    context.font = fontStr;
    context.clearRect(0, 0, width, height);
    // set canvas font info.
    context.textBaseline = "middle";
    context.fillStyle = "#fff";

    // draw lines.
    const { lines, lineHeight, lineWidths } = textMetrics;
    const halfLineHeight = lineHeight * 0.5;
    for (let i = 0, l = lines.length; i < l; ++i) {
      const lineWidth = lineWidths[i];
      const pos = TextUtils._tempVec2;
      TextUtils._calculateLinePosition(
        width,
        height,
        lineWidth,
        lineHeight,
        i,
        l,
        horizontalAlignment,
        verticalAlignment,
        pos
      );
      const { x, y } = pos;
      if (y + lineHeight >= 0 && y < height) {
        context.fillText(lines[i], x, y + halfLineHeight);
      }
    }
  }

  /**
   * Update canvas with the data.
   * @param width - the new width of canvas
   * @param height - the new height of canvas
   * @param data - the new data of canvas
   * @returns the canvas after update
   */
  public static updateCanvas(width: number, height: number, data: ImageData): HTMLCanvasElement | OffscreenCanvas {
    const { canvas, context } = TextUtils.textContext();
    canvas.width = width;
    canvas.height = height;
    context.putImageData(data, 0, 0);
    return canvas;
  }

  private static _wordWrap(text: string, width: number, enableWrapping: boolean, fontString: string): Array<string> {
    const { context } = TextUtils.textContext();
    const { _maxWidth: maxWidth } = TextUtils;
    const widthInPixel = width * TextUtils._pixelsPerUnit;
    const wrapWidth = Math.min(widthInPixel, maxWidth);
    const wrappedSubTexts = new Array<string>();
    const subTexts = text.split(/(?:\r\n|\r|\n)/);
    context.font = fontString;

    for (let i = 0, n = subTexts.length; i < n; ++i) {
      const subText = subTexts[i];
      const subWidth = Math.ceil(context.measureText(subText).width);
      const needWrap = enableWrapping || subWidth > maxWidth;
      if (needWrap) {
        if (subWidth <= wrapWidth) {
          wrappedSubTexts.push(subText);
        } else {
          let chars = "";
          let charsWidth = 0;
          for (let j = 0, m = subText.length; j < m; ++j) {
            const char = subText[j];
            const charWidth = Math.ceil(context.measureText(char).width);
            if (charsWidth + charWidth > wrapWidth) {
              // The width of text renderer is shorter than current char.
              if (charsWidth === 0) {
                wrappedSubTexts.push(char);
              } else {
                wrappedSubTexts.push(chars);
                chars = char;
                charsWidth = charWidth;
              }
            } else {
              chars += char;
              charsWidth += charWidth;
            }
          }
          if (charsWidth > 0) {
            wrappedSubTexts.push(chars);
          }
        }
      } else {
        wrappedSubTexts.push(subText);
      }
    }

    return wrappedSubTexts;
  }

  private static _calculateLinePosition(
    width: number,
    height: number,
    lineWidth: number,
    lineHeight: number,
    index: number,
    length: number,
    horizontalAlignment: TextHorizontalAlignment,
    verticalAlignment: TextVerticalAlignment,
    out: Vector2
  ): void {
    switch (verticalAlignment) {
      case TextVerticalAlignment.Top:
        out.y = index * lineHeight;
        break;
      case TextVerticalAlignment.Bottom:
        out.y = height - (length - index) * lineHeight;
        break;
      default:
        out.y = 0.5 * height - 0.5 * length * lineHeight + index * lineHeight;
        break;
    }

    switch (horizontalAlignment) {
      case TextHorizontalAlignment.Left:
        out.x = 0;
        break;
      case TextHorizontalAlignment.Right:
        out.x = width - lineWidth;
        break;
      default:
        out.x = (width - lineWidth) * 0.5;
        break;
    }
  }
}
