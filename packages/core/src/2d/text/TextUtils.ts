import { Vector2 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { FontStyle } from "../enums/FontStyle";
import { OverflowMode } from "../enums/TextOverflow";
import { CharInfo } from "./CharInfo";
import { SubFont } from "./SubFont";
import { TextRenderer } from "./TextRenderer";

/**
 * @internal
 * TextUtils includes some helper function for text.
 */
export class TextUtils {
  /** @internal */
  static _genericFontFamilies: string[] = [
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
      const context = <CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D>(
        canvas.getContext("2d", { willReadFrequently: true })
      );
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

  static measureTextWithWrap(renderer: TextRenderer): TextMetrics {
    const subFont = renderer._subFont;
    const fontString = subFont.nativeFontString;
    const fontSizeInfo = TextUtils.measureFont(fontString);
    const subTexts = renderer.text.split(/(?:\r\n|\r|\n)/);

    const lines = new Array<string>();
    const lineWidths = new Array<number>();
    const lineMaxSizes = new Array<FontSizeInfo>();

    const pixelsPerUnit = Engine._pixelsPerUnit;
    const lineHeight = fontSizeInfo.size + renderer.lineSpacing * pixelsPerUnit;
    const wrapWidth = renderer.width * pixelsPerUnit;
    let textWidth = 0;

    subFont.nativeFontString = fontString;
    for (let i = 0, n = subTexts.length; i < n; i++) {
      const subText = subTexts[i];
      // If subText is empty, push an empty line directly
      if (subText.length === 0) {
        this._pushLine(lines, lineWidths, lineMaxSizes, "", 0, 0, 0);
        continue;
      }

      let word = "";
      let wordWidth = 0;
      let wordMaxAscent = 0;
      let wordMaxDescent = 0;

      let line = "";
      let lineWidth = 0;
      let lineMaxAscent = 0;
      let lineMaxDescent = 0;

      let notFirstLine = false;

      for (let j = 0, m = subText.length; j < m; ++j) {
        const char = subText[j];
        const charInfo = TextUtils._getCharInfo(char, fontString, subFont);
        const charCode = char.charCodeAt(0);
        const isSpace = charCode === 32;

        if (isSpace && notFirstLine && line.length === 0 && word.length === 0) {
          continue;
        }

        // The char code scope of Chinese is [\u4e00-\u9fff]
        const unableFromWord = isSpace || (charCode >= 0x4e00 && charCode <= 0x9fff);
        const { w, offsetY } = charInfo;
        const halfH = charInfo.h * 0.5;
        const ascent = halfH + offsetY;
        const descent = halfH - offsetY;

        if (unableFromWord) {
          // If it is a word before, need to handle the previous word and line
          if (word.length > 0) {
            if (lineWidth + wordWidth > wrapWidth) {
              // Push if before line is not empty
              if (lineWidth > 0) {
                this._pushLine(lines, lineWidths, lineMaxSizes, line, lineWidth, lineMaxAscent, lineMaxDescent);
              }

              textWidth = Math.max(textWidth, lineWidth);
              notFirstLine = true;
              line = word;
              lineWidth = wordWidth;
              lineMaxAscent = wordMaxAscent;
              lineMaxDescent = wordMaxDescent;
            } else {
              line += word;
              lineWidth += wordWidth;
              lineMaxAscent = Math.max(lineMaxAscent, wordMaxAscent);
              lineMaxDescent = Math.max(lineMaxDescent, wordMaxDescent);
            }

            word = "";
            wordWidth = wordMaxAscent = wordMaxDescent = 0;
          }

          // Handle char
          // At least one char in a line
          if (lineWidth + w > wrapWidth && lineWidth > 0) {
            this._pushLine(lines, lineWidths, lineMaxSizes, line, lineWidth, lineMaxAscent, lineMaxDescent);
            textWidth = Math.max(textWidth, lineWidth);
            notFirstLine = true;
            if (isSpace) {
              line = "";
              lineWidth = lineMaxAscent = lineMaxDescent = 0;
            } else {
              line = char;
              lineWidth = charInfo.xAdvance;
              lineMaxAscent = ascent;
              lineMaxDescent = descent;
            }
          } else {
            line += char;
            lineWidth += charInfo.xAdvance;
            lineMaxAscent = Math.max(lineMaxAscent, ascent);
            lineMaxDescent = Math.max(lineMaxDescent, descent);
          }
        } else {
          if (wordWidth + charInfo.w > wrapWidth) {
            if (lineWidth > 0) {
              this._pushLine(lines, lineWidths, lineMaxSizes, line, lineWidth, lineMaxAscent, lineMaxDescent);
              textWidth = Math.max(textWidth, lineWidth);
              line = "";
              lineWidth = lineMaxAscent = lineMaxDescent = 0;
            }

            // Push if before word is not empty
            if (wordWidth > 0) {
              this._pushLine(lines, lineWidths, lineMaxSizes, word, wordWidth, wordMaxAscent, wordMaxDescent);
            }

            textWidth = Math.max(textWidth, wordWidth);
            notFirstLine = true;
            word = char;
            wordWidth = charInfo.xAdvance;
            wordMaxAscent = ascent;
            wordMaxDescent = descent;
          } else {
            word += char;
            wordWidth += charInfo.xAdvance;
            wordMaxAscent = Math.max(wordMaxAscent, ascent);
            wordMaxDescent = Math.max(wordMaxDescent, descent);
          }
        }
      }

      if (wordWidth > 0) {
        // If the total width from line and word exceed wrap width
        if (lineWidth + wordWidth > wrapWidth) {
          // Push chars to a single line
          if (lineWidth > 0) {
            this._pushLine(lines, lineWidths, lineMaxSizes, line, lineWidth, lineMaxAscent, lineMaxDescent);
          }
          textWidth = Math.max(textWidth, lineWidth);

          lineWidth = 0;
          // Push word to a single line
          if (wordWidth > 0) {
            this._pushLine(lines, lineWidths, lineMaxSizes, word, wordWidth, wordMaxAscent, wordMaxDescent);
          }
          textWidth = Math.max(textWidth, wordWidth);
        } else {
          // Merge to chars
          line += word;
          lineWidth += wordWidth;
          lineMaxAscent = Math.max(lineMaxAscent, wordMaxAscent);
          lineMaxDescent = Math.max(lineMaxDescent, wordMaxDescent);
        }
      }

      if (lineWidth > 0) {
        this._pushLine(lines, lineWidths, lineMaxSizes, line, lineWidth, lineMaxAscent, lineMaxDescent);
        textWidth = Math.max(textWidth, lineWidth);
      }
    }

    let height = renderer.height * pixelsPerUnit;
    if (renderer.overflowMode === OverflowMode.Overflow) {
      height = lineHeight * lines.length;
    }

    return {
      width: textWidth,
      height,
      lines,
      lineWidths,
      lineHeight,
      lineMaxSizes
    };
  }

  static measureTextWithoutWrap(renderer: TextRenderer): TextMetrics {
    const { _subFont: subFont } = renderer;
    const fontString = subFont.nativeFontString;
    const fontSizeInfo = TextUtils.measureFont(fontString);
    const subTexts = renderer.text.split(/(?:\r\n|\r|\n)/);
    const textCount = subTexts.length;
    const lines = new Array<string>();
    const lineWidths = new Array<number>();
    const lineMaxSizes = new Array<FontSizeInfo>();
    const { _pixelsPerUnit } = Engine;
    const lineHeight = fontSizeInfo.size + renderer.lineSpacing * _pixelsPerUnit;

    let width = 0;
    subFont.nativeFontString = fontString;
    for (let i = 0; i < textCount; ++i) {
      const line = subTexts[i];
      let curWidth = 0;
      let maxAscent = 0;
      let maxDescent = 0;

      for (let j = 0, m = line.length; j < m; ++j) {
        const charInfo = TextUtils._getCharInfo(line[j], fontString, subFont);
        curWidth += charInfo.xAdvance;
        const { offsetY } = charInfo;
        const halfH = charInfo.h * 0.5;
        const ascent = halfH + offsetY;
        const descent = halfH - offsetY;
        maxAscent < ascent && (maxAscent = ascent);
        maxDescent < descent && (maxDescent = descent);
      }

      if (curWidth > 0) {
        this._pushLine(lines, lineWidths, lineMaxSizes, line, curWidth, maxAscent, maxDescent);
        width = Math.max(width, curWidth);
      }
    }

    let height = renderer.height * _pixelsPerUnit;
    if (renderer.overflowMode === OverflowMode.Overflow) {
      height = lineHeight * lines.length;
    }

    return {
      width,
      height,
      lines,
      lineWidths,
      lineHeight,
      lineMaxSizes
    };
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
   * @internal
   * Use internal for CanvasRenderer plugin.
   */
  static _measureFontOrChar(fontString: string, char: string = ""): FontSizeInfo | CharInfo {
    const { canvas, context } = TextUtils.textContext();
    context.font = fontString;
    const measureString = char || TextUtils._measureString;
    // Safari gets data confusion through getImageData when the canvas width is not an integer.
    // The measure text width of some special invisible characters may be 0, so make sure the width is at least 1.
    // @todo: Text layout may vary from standard and not support emoji.
    const width = Math.max(1, Math.round(context.measureText(measureString).width));
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

    const colorData = context.getImageData(0, 0, width, height).data;
    const len = colorData.length;

    let top = -1;
    let bottom = -1;
    let y;
    let ascent = 0;
    let descent = 0;
    let size = 0;

    const integerW = canvas.width;
    const integerWReciprocal = 1.0 / integerW;
    for (let i = 0; i < len; i += 4) {
      if (colorData[i + 3] !== 0) {
        const idx = i * 0.25;
        y = ~~(idx * integerWReciprocal);

        if (top === -1) {
          top = y;
        }

        if (y > bottom) {
          bottom = y;
        }
      } else {
        colorData[i] = colorData[i + 1] = colorData[i + 2] = 255;
      }
    }

    if (top !== -1 && bottom !== -1) {
      ascent = baseline - top;
      descent = bottom - baseline + 1;
      size = ascent + descent;
    }
    const sizeInfo = { ascent, descent, size };

    if (char) {
      let data = null;
      if (size > 0) {
        const lineIntegerW = integerW * 4;
        // gl.texSubImage2D uploading data of type Uint8ClampedArray is not supported in some devices(eg: IphoneX IOS 13.6.1).
        data = new Uint8Array(colorData.buffer, top * lineIntegerW, size * lineIntegerW);
      }
      return {
        char,
        x: 0,
        y: 0,
        w: width,
        h: size,
        offsetX: 0,
        offsetY: (ascent - descent) * 0.5,
        xAdvance: width,
        uvs: [new Vector2(), new Vector2(), new Vector2(), new Vector2()],
        ascent,
        descent,
        index: 0,
        data
      };
    } else {
      return sizeInfo;
    }
  }

  /**
   * @internal
   * Use internal for CanvasRenderer plugin.
   */
  static _getCharInfo(char: string, fontString: string, font: SubFont): CharInfo {
    let charInfo = font._getCharInfo(char);
    if (!charInfo) {
      charInfo = TextUtils.measureChar(char, fontString);
      font._uploadCharTexture(charInfo);
      font._addCharInfo(char, charInfo);
    }

    return charInfo;
  }

  private static _pushLine(
    lines: string[],
    lineWidths: number[],
    lineMaxSizes: FontSizeInfo[],
    line: string,
    lineWidth: number,
    ascent: number,
    descent: number
  ): void {
    lines.push(line);
    lineWidths.push(lineWidth);
    lineMaxSizes.push({
      ascent,
      descent,
      size: ascent + descent
    });
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
