import { Vector3 } from "@oasis-engine/math";
import { Engine } from "../../Engine";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";
import { Font } from "../text";
import { TextRenderer, DirtyFlag } from "../text/TextRenderer";
import { TextUtils, TextMetrics, FontSizeInfo } from "../text/TextUtils";
import { CharInfo } from "./CharInfo";
import { CharRenderDataPool } from "./CharRenderDataPool";
import { IAssembler } from "./IAssembler";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";

/**
 * @internal
 */
@StaticInterfaceImplement<IAssembler>()
export class CharAssembler {
  private static _charRenderDataPool: CharRenderDataPool;

  static resetData(renderer: TextRenderer): void {
    if (!CharAssembler._charRenderDataPool) {
      CharAssembler._charRenderDataPool = new CharRenderDataPool();
    }
  }

  static updateData(renderer: TextRenderer): void {
    const isTextureDirty = renderer._isContainDirtyFlag(DirtyFlag.Property);
    if (isTextureDirty) {
      CharAssembler.clearData(renderer);
      renderer._charFont = Font.createFromOS(renderer.engine, TextUtils.getNativeFontHash(renderer.font.name, renderer.fontSize, renderer.fontStyle));
      renderer._charFont._addRefCount(1);
      CharAssembler._updateText(renderer);
      renderer._setDirtyFlagFalse(DirtyFlag.Property);
    }

    if (renderer._isWorldMatrixDirty.flag || isTextureDirty) {
      CharAssembler._updatePosition(renderer);
      renderer._isWorldMatrixDirty.flag = false;
    }
  }

  static clearData(renderer: TextRenderer): void {
    const { _charRenderDatas } = renderer;
    for (let i = 0, l = _charRenderDatas.length; i < l; ++i) {
      CharAssembler._charRenderDataPool.putData(_charRenderDatas[i]);
    }
    _charRenderDatas.length = 0;

    const { _charFont } = renderer;
    if (_charFont) {
      _charFont._addRefCount(-1);
      _charFont.destroy();
      renderer._charFont = null;
    }
  }

  private static _updatePosition(renderer: TextRenderer): void {
    const worldMatrix = renderer.entity.transform.worldMatrix;
    const { _charRenderDatas } = renderer;
    for (let i = 0, l = _charRenderDatas.length; i < l; ++i) {
      const { localPositions, renderData } = _charRenderDatas[i];
      for (let j = 0; j < 4; ++j) {
        Vector3.transformToVec3(localPositions[j], worldMatrix, renderData.positions[j]);
      }
    }
  }

  private static _updateText(renderer: TextRenderer): void {
    const { color, horizontalAlignment, verticalAlignment, _charRenderDatas } = renderer;
    const { _pixelsPerUnit } = Engine;
    const pixelsPerUnitReciprocal = 1.0 / _pixelsPerUnit;
    const charFont = renderer._charFont;
    const rendererWidth = renderer.width * _pixelsPerUnit;
    const rendererHeight = renderer.height * _pixelsPerUnit;

    const textMetrics = renderer.enableWrapping
      ? CharAssembler._measureTextWithWrap(renderer)
      : CharAssembler._measureTextWithoutWrap(renderer);
    const { height, lines, lineWidths, lineHeight, lineMaxSizes } = textMetrics;
    const { _charRenderDataPool } = CharAssembler;
    const halfLineHeight = lineHeight * 0.5;
    const linesLen = lines.length;

    let startY = 0;
    const topDiff = lineHeight * 0.5 - lineMaxSizes[0].ascent;
    const bottomDiff = lineHeight * 0.5 - lineMaxSizes[linesLen - 1].descent - 1;
    switch (verticalAlignment) {
      case TextVerticalAlignment.Top:
        startY = rendererHeight * 0.5 - halfLineHeight + topDiff;
        break;
      case TextVerticalAlignment.Center:
        startY = height * 0.5 - halfLineHeight - (bottomDiff - topDiff) * 0.5;
        break;
      case TextVerticalAlignment.Bottom:
        startY = height - rendererHeight * 0.5 - halfLineHeight - bottomDiff;
        break;
    }

    for (let i = 0; i < linesLen; ++i) {
      const line = lines[i];
      const lineWidth = lineWidths[i];

      let startX = 0;
      switch (horizontalAlignment) {
        case TextHorizontalAlignment.Left:
          startX = -rendererWidth * 0.5;
          break;
        case TextHorizontalAlignment.Center:
          startX = -lineWidth * 0.5;
          break;
        case TextHorizontalAlignment.Right:
          startX = rendererWidth * 0.5 - lineWidth;
          break;
      }

      for (let j = 0, m = line.length; j < m; ++j) {
        const char = line[j];
        const charInfo = charFont.getCharInfo(char.charCodeAt(0));

        if (charInfo.h > 0) {
          const charRenderData = _charRenderDataPool.getData();
          const { renderData, localPositions } = charRenderData;
          charRenderData.texture = charFont.getTextureByIndex(charInfo.index);
          renderData.color = color;

          const { uvs } = renderData;
          const { w, u0, v0, u1, v1, ascent, descent } = charInfo;

          const left = startX * pixelsPerUnitReciprocal;
          const right = (startX + w) * pixelsPerUnitReciprocal;
          const top = (startY + ascent) * pixelsPerUnitReciprocal;
          const bottom = (startY - descent + 1) * pixelsPerUnitReciprocal;
          // Top-left.
          localPositions[0].set(left, top, 0);
          uvs[0].set(u0, v0);
          // Top-right.
          localPositions[1].set(right, top, 0);
          uvs[1].set(u1, v0);
          // Bottom-right.
          localPositions[2].set(right, bottom, 0);
          uvs[2].set(u1, v1);
          // Bottom-left.
          localPositions[3].set(left, bottom, 0);
          uvs[3].set(u0, v1);

          _charRenderDatas.push(charRenderData);
        }
        startX += charInfo.xAdvance;
      }

      startY -= lineHeight;
    }
  }

  private static _measureTextWithWrap(renderer: TextRenderer): TextMetrics {
    const { fontSize, fontStyle } = renderer;
    const { name } = renderer.font;
    const fontString = TextUtils.getNativeFontString(name, fontSize, fontStyle);
    const charFont = renderer._charFont;
    const fontSizeInfo = TextUtils.measureFont(fontString);
    const subTexts = renderer.text.split(/(?:\r\n|\r|\n)/);
    const lines = new Array<string>();
    const lineWidths = new Array<number>();
    const lineMaxSizes = new Array<FontSizeInfo>();
    const { _pixelsPerUnit } = Engine;
    const lineHeight = fontSizeInfo.size + renderer.lineSpacing * _pixelsPerUnit;
    const wrapWidth = renderer.width * _pixelsPerUnit;
    let width = 0;

    for (let i = 0, n = subTexts.length; i < n; ++i) {
      const subText = subTexts[i];
      let chars = "";
      let charsWidth = 0;
      let maxAscent = -1;
      let maxDescent = -1;

      for (let j = 0, m = subText.length; j < m; ++j) {
        const char = subText[j];
        const charInfo = CharAssembler._getCharInfo(char, fontString, charFont);
        const { w, offsetY } = charInfo;
        const halfH = charInfo.h * 0.5;
        const ascent = halfH + offsetY;
        const descent = halfH - offsetY;
        if (charsWidth + w > wrapWidth) {
          if (charsWidth === 0) {
            lines.push(char);
            lineWidths.push(w);
            lineMaxSizes.push({
              ascent,
              descent,
              size: ascent + descent
            });
          } else {
            lines.push(chars);
            lineWidths.push(charsWidth);
            lineMaxSizes.push({
              ascent: maxAscent,
              descent: maxDescent,
              size: maxAscent + maxDescent
            });
            chars = char;
            charsWidth = charInfo.xAdvance;
            maxAscent = ascent;
            maxDescent = descent;
          }
        } else {
          chars += char;
          charsWidth += charInfo.xAdvance;
          maxAscent < ascent && (maxAscent = ascent);
          maxDescent < descent && (maxDescent = descent);
        }
      }

      if (charsWidth > 0) {
        lines.push(chars);
        lineWidths.push(charsWidth);
        lineMaxSizes.push({
          ascent: maxAscent,
          descent: maxDescent,
          size: maxAscent + maxDescent
        });
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

  private static _measureTextWithoutWrap(renderer: TextRenderer): TextMetrics {
    const { fontSize, fontStyle } = renderer;
    const { name } = renderer.font;
    const fontString = TextUtils.getNativeFontString(name, fontSize, fontStyle);
    const charFont = renderer._charFont;
    const fontSizeInfo = TextUtils.measureFont(fontString);
    const lines = renderer.text.split(/(?:\r\n|\r|\n)/);
    const lineCount = lines.length;
    const lineWidths = new Array<number>();
    const lineMaxSizes = new Array<FontSizeInfo>();
    const { _pixelsPerUnit } = Engine;
    const lineHeight = fontSizeInfo.size + renderer.lineSpacing * _pixelsPerUnit;
    let width = 0;
    let height = renderer.height * _pixelsPerUnit;
    if (renderer.overflowMode === OverflowMode.Overflow) {
      height = lineHeight * lineCount;
    }

    for (let i = 0; i < lineCount; ++i) {
      const line = lines[i];
      let curWidth = 0;
      let maxAscent = -1;
      let maxDescent = -1;

      for (let j = 0, m = line.length; j < m; ++j) {
        const charInfo = CharAssembler._getCharInfo(line[j], fontString, charFont);
        curWidth += charInfo.xAdvance;
        const { offsetY } = charInfo;
        const halfH = charInfo.h * 0.5;
        const ascent = halfH + offsetY;
        const descent = halfH - offsetY;
        maxAscent < ascent && (maxAscent = ascent);
        maxDescent < descent && (maxDescent = descent);
      }
      lineWidths[i] = curWidth;
      lineMaxSizes[i] = {
        ascent: maxAscent,
        descent: maxDescent,
        size: maxAscent + maxDescent
      };
      if (curWidth > width) {
        width = curWidth;
      }
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

  private static _getCharInfo(char: string, fontString: string, font: Font): CharInfo {
    const id = char.charCodeAt(0);
    let charInfo = font.getCharInfo(id);
    if (!charInfo) {
      const charMetrics = TextUtils.measureChar(char, fontString);
      const { width, sizeInfo } = charMetrics;
      const { ascent, descent } = sizeInfo;
      const offsetY = (ascent - descent) * 0.5;
      charInfo = font.addCharInfo(
        id,
        TextUtils.textContext().canvas,
        width,
        sizeInfo.size,
        0,
        offsetY,
        width,
        ascent,
        descent
      );
    }

    return charInfo;
  }
}
