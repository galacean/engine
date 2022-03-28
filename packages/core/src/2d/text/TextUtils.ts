import { Vector2 } from "@oasis-engine/math";
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
  maxLineWidth: number;
  lineHeight: number;
  fontSize: number;
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
  private static _testString: string = "|ÉqÅ";
  private static _testBaseline: string = "M";
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
    if (!TextUtils._textContext) {
      const offscreenCanvas = new OffscreenCanvas(0, 0);
      if (offscreenCanvas) {
        const context = offscreenCanvas.getContext("2d");
        if (context && context.measureText) {
          TextUtils._textContext = { canvas: offscreenCanvas, context };
          return TextUtils._textContext;
        }
      }

      const canvas = document.createElement("canvas");
      TextUtils._textContext = { canvas, context: offscreenCanvas.getContext("2d") };
    }

    return TextUtils._textContext;
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
    const testStr = TextUtils._testString;
    const width = Math.ceil(context.measureText(testStr).width);
    let baseline = Math.ceil(context.measureText(TextUtils._testBaseline).width);
    const height = baseline * TextUtils._heightMultiplier;
    baseline = (TextUtils._baselineMultiplier * baseline) | 0;

    canvas.width = width;
    canvas.height = height;

    context.font = font;
    context.fillStyle = "#000";
    context.clearRect(0, 0, width, height);
    context.textBaseline = "alphabetic";
    context.fillStyle = "#f00";
    context.fillText(testStr, 0, baseline);

    const imgData = context.getImageData(0, 0, width, height).data;
    const lineDataCount = width * 4;
    let flag = false;
    let i = 0;
    let startIndex = 0;

    for (i = 0; i < baseline; ++i) {
      startIndex = i * lineDataCount;
      for (let j = 0; j < lineDataCount; j += 4) {
        if (imgData[startIndex + j] !== 0) {
          flag = true;
          break;
        }
      }
      if (flag) {
        break;
      }
    }

    const ascent = baseline - i;
    flag = false;

    for (i = height - 1; i >= baseline; --i) {
      startIndex = i * lineDataCount;
      for (let j = 0; j < lineDataCount; j += 4) {
        if (imgData[startIndex + j] !== 0) {
          flag = true;
          break;
        }
      }
      if (flag) {
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
   * @param fontStr - the font string
   * @returns the TextMetrics object
   */
  public static measureText(
    text: string,
    originWidth: number,
    originHeight: number,
    lineSpacing: number,
    enableWrapping: boolean,
    overflowMode: OverflowMode,
    fontStr: string
  ): TextMetrics {
    const { _pixelsPerUnit } = TextUtils;
    const fontSize = TextUtils.measureFont(fontStr);
    const textContext = TextUtils.textContext();
    const { context } = textContext;
    context.font = fontStr;
    const lines = TextUtils._wordWrap(text, originWidth, enableWrapping, fontStr);
    const linesLen = lines.length;
    const lineWidths = new Array<number>();
    const lineHeight = fontSize + lineSpacing * _pixelsPerUnit;
    // Calculate max width of all lines.
    let maxLineWidth = 0;
    for (let i = 0; i < linesLen; ++i) {
      const width = Math.ceil(context.measureText(lines[i]).width);
      if (width > maxLineWidth) {
        maxLineWidth = width;
      }
      lineWidths.push(width);
    }

    // Reset width and height.
    const width = Math.min(maxLineWidth, TextUtils._maxWidth);
    let height = originHeight * _pixelsPerUnit;
    if (overflowMode === OverflowMode.Overflow) {
      height = Math.min(lineHeight * linesLen, TextUtils._maxHeight);
    }

    return {
      width,
      height,
      lines,
      lineWidths,
      maxLineWidth,
      lineHeight,
      fontSize
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
    let left = -1;
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

        if (left === -1 || x < left) {
          left = x;
        }

        if (right === null || x > right) {
          right = x;
        }

        if (bottom === null || y > bottom) {
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
    context.textBaseline = "top";
    context.fillStyle = "#fff";

    // draw lines.
    const { lines, lineHeight, lineWidths } = textMetrics;
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
        // +1, for chrome.
        context.fillText(lines[i], x, y + 1);
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

  private static _wordWrap(text: string, width: number, enableWrapping: boolean, fontStr: string): Array<string> {
    const { context } = TextUtils.textContext();
    const { _maxWidth: maxWidth } = TextUtils;
    const widthInPixel = width * TextUtils._pixelsPerUnit;
    const output = new Array<string>();
    context.font = fontStr;
    const textArr = text.split(/(?:\r\n|\r|\n)/);

    for (let i = 0, l = textArr.length; i < l; ++i) {
      const curText = textArr[i];
      const curWidth = Math.ceil(context.measureText(curText).width);
      const needWrap = enableWrapping || curWidth > maxWidth;
      const wrapWidth = Math.min(widthInPixel, maxWidth);
      if (needWrap) {
        if (curWidth <= wrapWidth) {
          output.push(curText);
        } else {
          let chars = "";
          let charsWidth = 0;
          for (let j = 0, l = curText.length; j < l; ++j) {
            const curChar = curText[j];
            const curCharWidth = Math.ceil(context.measureText(curChar).width);
            if (charsWidth + curCharWidth > wrapWidth) {
              // The width of text renderer is shorter than current char.
              if (charsWidth === 0) {
                output.push(curChar);
              } else {
                output.push(chars);
                chars = curChar;
                charsWidth = curCharWidth;
              }
            } else {
              chars += curChar;
              charsWidth += curCharWidth;
            }
          }
          if (charsWidth > 0) {
            output.push(chars);
          }
        }
      } else {
        output.push(curText);
      }
    }

    return output;
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
