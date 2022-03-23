import { OverflowMode } from "../enums/TextOverflow";
import { TextRenderer } from "./TextRenderer";

/**
 * TextContext.
 */
export interface TextContext {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

/**
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
 * TextUtils includes some helper function for text.
 */
export class TextUtils {
  private static _testString = "qpjÉÅ";
  private static _testBaseline = "M";
  private static _heightMultiplier = 2;
  private static _baselineMultiplier = 1.4;
  private static _maxWidth = 2048;
  private static _maxHeight = 2048;
  private static _pixelsPerUnit = 128;
  private static _fontSizes: { [font: string]: number } = {};
  private static _textContext: TextContext = null;

  /**
   * The instance function to get an object includes 2d context and canvas.
   * @returns the TextContext object
   */
  public static textContext(): TextContext {
    if (!TextUtils._textContext) {
      const canvas = document.createElement("canvas");
      TextUtils._textContext = {
        canvas: canvas,
        context: canvas.getContext("2d")
      };
    }

    return TextUtils._textContext;
  }

  /**
   * Measure the font.
   * @param textContext - text context includes 2d context and canvas
   * @param font - the string of the font
   * @returns the font size
   */
  public static measureFont(textContext: TextContext, font: string): number {
    const { _fontSizes: fontSizes } = TextUtils;
    if (fontSizes[font]) {
      return fontSizes[font];
    }

    const { canvas, context } = textContext;
    context.font = font;
    const testStr = TextUtils._testString;
    const width = Math.ceil(context.measureText(testStr).width);
    let baseline = Math.ceil(context.measureText(TextUtils._testBaseline).width);
    const height = baseline * TextUtils._heightMultiplier;
    baseline = Math.floor(TextUtils._baselineMultiplier * baseline);

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
    const fontSize = ascent + descent;
    TextUtils._fontSizes[font] = fontSize;
    return fontSize;
  }

  /**
   * Measure the text.
   * @param textContext - text context includes 2d context and canvas
   * @param textRenderer - the text renderer
   * @param fontStr - the string of font
   * @returns the TextMetrics object
   */
  public static measureText(textContext: TextContext, textRenderer: TextRenderer, fontStr: string): TextMetrics {
    const { _pixelsPerUnit } = TextUtils;
    const fontSize = TextUtils.measureFont(textContext, fontStr);
    const textMetrics: TextMetrics = {
      width: 0,
      height: 0,
      lines: TextUtils._wordWrap(textRenderer, fontStr),
      lineWidths: [],
      maxLineWidth: 0,
      lineHeight: fontSize + textRenderer.lineSpacing * _pixelsPerUnit,
      fontSize
    };
    const { context } = textContext;
    const { lines } = textMetrics;
    const linesLen = lines.length;
    if (linesLen === 0) {
      return textMetrics;
    }

    context.font = fontStr;
    const { lineWidths } = textMetrics;
    let maxLineWidth = 0;
    for (let i = 0; i < linesLen; ++i) {
      const width = Math.ceil(context.measureText(lines[i]).width);
      if (width > maxLineWidth) {
        maxLineWidth = width;
      }
      lineWidths.push(width);
    }
    textMetrics.maxLineWidth = maxLineWidth;

    // reset width and height.
    textMetrics.width = Math.min(maxLineWidth, TextUtils._maxWidth);
    let height = textRenderer.height * _pixelsPerUnit;
    if (textRenderer.overflowMode === OverflowMode.Overflow) {
      height = Math.min(textMetrics.lineHeight * linesLen, TextUtils._maxHeight);
    }
    textMetrics.height = height;

    return textMetrics;
  }

  /**
   * Trim canvas.
   * @param textContext - text context includes gl context and canvas
   * @returns the width and height after trim, and the image data
   */
  public static trimCanvas(textContext: TextContext): { width: number; height: number; data?: ImageData } {
    // https://gist.github.com/remy/784508

    const { canvas, context } = textContext;
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

  private static _wordWrap(textRenderer: TextRenderer, fontStr: string): Array<string> {
    const { width, height, enableWrapping, overflowMode } = textRenderer;

    if (enableWrapping && width <= 0) {
      return [];
    }
    if (overflowMode === OverflowMode.Truncate && height <= 0) {
      return [];
    }

    const { context } = TextUtils.textContext();
    const { _maxWidth: maxWidth } = TextUtils;
    const { text } = textRenderer;
    const widthInPixel = width * TextUtils._pixelsPerUnit;
    const output: Array<string> = [];
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
}
