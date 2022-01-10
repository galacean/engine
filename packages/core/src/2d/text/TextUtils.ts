import { TextHorizontalOverflow, TextVerticalOverflow } from "../enums/TextOverflow";
import { TextRenderer } from "./TextRenderer";

interface TextContext {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

export class TextUtils {
  public static TEST_STRING = "qpjÉÅ";
  public static TEST_BASELINE = "M";
  public static HEIGHT_MULTIPLIER = 2;
  public static BASELINE_MULTIPLIER = 1.4;

  public static fontSizes: { [font: string]: number } = {};
  private static _textContext: TextContext = null;

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

  public static measureFont(textContext: TextContext, font: string): number {
    const { fontSizes } = TextUtils;
    if (fontSizes[font]) {
      return fontSizes[font];
    }

    const { canvas, context } = textContext;
    context.font = font;
    const testStr = TextUtils.TEST_STRING;
    const width = Math.ceil(context.measureText(testStr).width);
    let baseline = Math.ceil(context.measureText(TextUtils.TEST_BASELINE).width);
    const height = baseline * TextUtils.HEIGHT_MULTIPLIER;
    baseline = Math.floor(TextUtils.BASELINE_MULTIPLIER * baseline);

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
        if (imgData[startIndex + j] !== 255) {
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
    TextUtils.fontSizes[font] = fontSize;
    return fontSize;
  }

  public static measureText(textContext: TextContext, textRenderer: TextRenderer, fontStr: string): void {
    const fontSize = TextUtils.measureFont(textContext, fontStr);
    // const wrappedTexts = TextUtils._wordWrap(textRenderer, fontStr);
    const { text } = textRenderer;
    const { canvas, context } = textContext;
    context.font = fontStr;
    const width = Math.ceil(context.measureText(text || "").width);
    if (width === 0) {
      return ;
    }
    canvas.width = width;
    canvas.height = fontSize;
    context.font = fontStr;
    context.clearRect(0, 0, width, fontSize);
    context.textBaseline = "top";
    context.fillStyle = '#fff';
    context.fillText(text, 0, 0);
  }

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
    const { width, height, horizontalOverflow, verticalOverflow } = textRenderer;
    const isWrap = horizontalOverflow === TextHorizontalOverflow.Wrap;

    // 
    if (isWrap && width === 0) {
      return [];
    }
    if (verticalOverflow === TextVerticalOverflow.Truncate && height === 0) {
      return [];
    }

    const { context } = TextUtils.textContext();
    const { sprite, text } = textRenderer;
    const { pixelsPerUnit } = sprite;
    const widthInPixel = width * pixelsPerUnit;
    const output: Array<string> = [];
    context.font = fontStr;
    const textArr = text.split("\n");

    for (let i = 0, l = textArr.length; i < l; ++i) {
      const curText = textArr[i];
      const curWidth = Math.ceil(context.measureText(curText).width);
      if (isWrap) {
        if (curWidth <= widthInPixel) {
          output.push(curText);
        } else {
          let chars = '';
          let charsWidth = 0;
          for (let j = 0, l = curText.length; i < l; ++j) {
            const curChar = curText[i];
            const curCharWidth = Math.ceil(context.measureText(curChar).width);
            if (charsWidth + curCharWidth > widthInPixel) {
              // The width of text renderer is shorter than cur char.
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
