import { Vector3 } from "@oasis-engine/math";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";
import { TextRenderer, DirtyFlag } from "../text/TextRenderer";
import { TextUtils, TextMetrics, FontSizeInfo } from "../text/TextUtils";
import { CharRenderDataPool } from "./CharRenderDataPool";
import { CharDefWithTexture, CharUtils } from "./CharUtils";
import { IAssembler } from "./IAssembler";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";

@StaticInterfaceImplement<IAssembler>()
export class CharAssembler {
  private static _charUtils: CharUtils;
  private static _charRenderDataPool: CharRenderDataPool;

  static resetData(renderer: TextRenderer): void {
    if (!CharAssembler._charUtils) {
      CharAssembler._charUtils = new CharUtils(renderer.engine);
      CharAssembler._charRenderDataPool = new CharRenderDataPool();
    }
  }

  static updateData(renderer: TextRenderer): void {
    const isTextureDirty = renderer._isContainDirtyFlag(DirtyFlag.Property);
    if (isTextureDirty) {
      CharAssembler.clearData(renderer);
      CharAssembler._updateText(renderer);
      renderer._setDirtyFlagFalse(DirtyFlag.Property);
    }

    if (renderer._isWorldMatrixDirty.flag || isTextureDirty) {
      CharAssembler._updatePosition(renderer);
      renderer._isWorldMatrixDirty.flag = false;
    }
  }

  static clear(): void {
    if (CharAssembler._charUtils) {
      CharAssembler._charUtils.clear();
      CharAssembler._charUtils = null;
    }
  }

  static clearData(renderer: TextRenderer): void {
    const { _charRenderDatas } = renderer;
    for (let i = 0, l = _charRenderDatas.length; i < l; ++i) {
      CharAssembler._charRenderDataPool.putData(_charRenderDatas[i]);
    }
    _charRenderDatas.length = 0;
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
    const { color, fontSize, fontStyle, horizontalAlignment, verticalAlignment, _charRenderDatas } = renderer;
    const { name } = renderer.font;
    const { _pixelsPerUnit } = TextUtils;
    const pixelsPerUnitReciprocal = 1.0 / _pixelsPerUnit;
    const fontHash = TextUtils.getNativeFontHash(name, fontSize, fontStyle);
    const rendererWidth = renderer.width * _pixelsPerUnit;
    const rendererHeight = renderer.height * _pixelsPerUnit;

    const textMetrics = renderer.enableWrapping
      ? CharAssembler._measureTextWithWrap(renderer)
      : CharAssembler._measureTextWithoutWrap(renderer);
    const { height, lines, lineWidths, lineHeight, lineMaxSizes } = textMetrics;
    const { _charUtils, _charRenderDataPool } = CharAssembler;
    const textureSizeReciprocal = 1.0 / _charUtils.getTextureSize();

    for (let i = 0, n = lines.length; i < n; ++i) {
      const line = lines[i];
      const lineWidth = lineWidths[i];
      const sizeInfo = lineMaxSizes[i];
      const { ascent: maxAscent } = sizeInfo;
      const halfLineHeightDiff = (lineHeight - sizeInfo.size) * 0.5;

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
      let startY = 0;
      switch (verticalAlignment) {
        case TextVerticalAlignment.Top:
          startY = rendererHeight * 0.5 + halfLineHeightDiff - i * lineHeight;
          break;
        case TextVerticalAlignment.Center:
          startY = height * 0.5 - i * lineHeight;
          break;
        case TextVerticalAlignment.Bottom:
          startY = height - rendererHeight * 0.5 - halfLineHeightDiff - i * lineHeight;
          break;
      }

      for (let j = 0, m = line.length; j < m; ++j) {
        const char = line[j];
        const key = `${fontHash}${char.charCodeAt(0)}`;
        const charDefWithTexture = _charUtils.getCharDef(key);
        const { charDef } = charDefWithTexture;

        if (charDef.h > 0) {
          const charRenderData = _charRenderDataPool.getData();
          const { renderData, localPositions } = charRenderData;
          charRenderData.texture = charDefWithTexture.texture;
          renderData.color = color;

          const { uvs } = renderData;
          const { x, y, w, h } = charDef;
          const left = startX * pixelsPerUnitReciprocal;
          const right = (startX + w) * pixelsPerUnitReciprocal;
          const top = (startY - halfLineHeightDiff - maxAscent + h * 0.5 + charDef.offsetY) * pixelsPerUnitReciprocal;
          const bottom = top - h * pixelsPerUnitReciprocal;
          const u0 = x * textureSizeReciprocal;
          const u1 = (x + w) * textureSizeReciprocal;
          const v0 = y * textureSizeReciprocal;
          const v1 = (y + h) * textureSizeReciprocal;
          // Top-left.
          localPositions[0].setValue(left, top, 0);
          uvs[0].setValue(u0, v0);
          // Top-right.
          localPositions[1].setValue(right, top, 0);
          uvs[1].setValue(u1, v0);
          // Bottom-right.
          localPositions[2].setValue(right, bottom, 0);
          uvs[2].setValue(u1, v1);
          // Bottom-left.
          localPositions[3].setValue(left, bottom, 0);
          uvs[3].setValue(u0, v1);

          _charRenderDatas.push(charRenderData);
        }
        startX += charDef.xAdvance;
      }
    }
  }

  private static _measureTextWithWrap(renderer: TextRenderer): TextMetrics {
    const { fontSize, fontStyle } = renderer;
    const { name } = renderer.font;
    const fontString = TextUtils.getNativeFontString(name, fontSize, fontStyle);
    const fontHash = TextUtils.getNativeFontHash(name, fontSize, fontStyle);
    const fontSizeInfo = TextUtils.measureFont(fontString);
    const subTexts = renderer.text.split(/(?:\r\n|\r|\n)/);
    const lines = new Array<string>();
    const lineWidths = new Array<number>();
    const lineMaxSizes = new Array<FontSizeInfo>();
    const { _pixelsPerUnit } = TextUtils;
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
        const charDefWithTexture = CharAssembler._getCharDefWithTexture(char, fontString, fontHash);
        const { charDef } = charDefWithTexture;
        const { w, offsetY } = charDef;
        const halfH = charDef.h * 0.5;
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
            charsWidth = charDef.xAdvance;
            maxAscent = ascent;
            maxDescent = descent;
          }
        } else {
          chars += char;
          charsWidth += charDef.xAdvance;
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
    const fontHash = TextUtils.getNativeFontHash(name, fontSize, fontStyle);
    const fontSizeInfo = TextUtils.measureFont(fontString);
    const lines = renderer.text.split(/(?:\r\n|\r|\n)/);
    const lineCount = lines.length;
    const lineWidths = new Array<number>();
    const lineMaxSizes = new Array<FontSizeInfo>();
    const { _pixelsPerUnit } = TextUtils;
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
        const charDefWithTexture = CharAssembler._getCharDefWithTexture(line[j], fontString, fontHash);
        const { charDef } = charDefWithTexture;
        curWidth += charDef.xAdvance;
        const { offsetY } = charDef;
        const halfH = charDef.h * 0.5;
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

  private static _getCharDefWithTexture(char: string, fontString: string, fontHash: string): CharDefWithTexture {
    const { _charUtils } = CharAssembler;
    const key = `${fontHash}${char.charCodeAt(0)}`;
    let charDefWithTexture = _charUtils.getCharDef(key);
    if (!charDefWithTexture) {
      const charMetrics = TextUtils.measureChar(char, fontString);
      const { sizeInfo } = charMetrics;
      const { ascent, descent } = sizeInfo;
      const offsetY = (ascent - descent) * 0.5;
      charDefWithTexture = _charUtils.addCharDef(
        key,
        TextUtils.textContext().canvas,
        charMetrics.width,
        sizeInfo.size,
        0,
        offsetY
      );
    }

    return charDefWithTexture;
  }
}
