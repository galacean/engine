import { Vector3 } from "@oasis-engine/math";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";
import { TextRenderer, DirtyFlag } from "../text/TextRenderer";
import { TextUtils, TextMetrics } from "../text/TextUtils";
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
    const { _charRenderDatas } = renderer;
    for (let i = 0, l = _charRenderDatas.length; i < l; ++i) {
      CharAssembler._charRenderDataPool.putData(_charRenderDatas[i]);
    }
    _charRenderDatas.length = 0;
  }

  static updateData(renderer: TextRenderer): void {
    const isTextureDirty = renderer._isContainDirtyFlag(DirtyFlag.Property);
    if (isTextureDirty) {
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
    const fontString = TextUtils.getNativeFontString(name, fontSize, fontStyle);
    const fontSizeInfo = TextUtils.measureFont(fontString);
    const fontHash = TextUtils.getNativeFontHash(name, fontSize, fontStyle);
    const widthInPixel = renderer.width * _pixelsPerUnit;
    const heightInPixel = renderer.height * _pixelsPerUnit;

    const textMetrics = renderer.enableWrapping ? CharAssembler._measureTextWithWrap(renderer) : CharAssembler._measureTextWithoutWrap(renderer);
    const { width, height, lines, lineWidths, lineHeight } = textMetrics;

    let startY = 0;
    switch (verticalAlignment) {
      case TextVerticalAlignment.Top:
        startY = heightInPixel * 0.5;
        break;
      case TextVerticalAlignment.Center:
        startY = height * 0.5;
        break;
      case TextVerticalAlignment.Bottom:
        startY = height - heightInPixel * 0.5;
        break;
    }

    for (let i = 0, n = lines.length; i < n; ++i) {
      const line = lines[i];
      const lineWidth = lineWidths[i];

      let startX = 0;
      switch (horizontalAlignment) {
        case TextHorizontalAlignment.Left:
          startX = -widthInPixel * 0.5;
          break;
        case TextHorizontalAlignment.Center:
          startX = -lineWidth * 0.5;
          break;
        case TextHorizontalAlignment.Right:
          startX = widthInPixel * 0.5 - lineWidth;
          break;
      }
      startY -= (i + 0/.5) * lineHeight;

      for (let j = 0, m = line.length; j < m; ++j) {
        const char = line[j];
        const key = `${fontHash}${char.charCodeAt(0)}`;
        const charDefWithTexture = CharAssembler._charUtils.getCharDef(key);
        const { charDef } = charDefWithTexture;
        const charRenderData = CharAssembler._charRenderDataPool.getData();
        const { renderData, localPositions } = charRenderData;
        charRenderData.texture = charDefWithTexture.texture;
        renderData.color = color;
        const textureSize = CharAssembler._charUtils.getTextureSize();

        const { uvs } = renderData;
        const { x, y, w, h} = charDef;
        const left = startX / _pixelsPerUnit;
        const right = (startX + charDef.w) / _pixelsPerUnit;
        const top = (startY + charDef.offsetY + h * 0.5) / _pixelsPerUnit;
        const bottom = (top - h) / _pixelsPerUnit;
        // Top-left.
        localPositions[0].setValue(left, top, 0);
        uvs[0].setValue(x / textureSize, y / textureSize);
        // Top-right.
        localPositions[1].setValue(right, top, 0);
        uvs[1].setValue((x + w) / textureSize, h / textureSize);
        // Bottom-right.
        localPositions[2].setValue(right, bottom, 0);
        uvs[2].setValue((x + w) / textureSize, (y + h) / textureSize);
        // Bottom-left.
        localPositions[3].setValue(left, bottom, 0);
        uvs[3].setValue(x / textureSize, (y + h) / textureSize);

        _charRenderDatas.push(charRenderData);
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
    const { _pixelsPerUnit } = TextUtils;
    const lineHeight = fontSizeInfo.size + renderer.lineSpacing * _pixelsPerUnit;
    const wrapWidth = renderer.width * _pixelsPerUnit;
    let width = 0;

    for (let i = 0, n = subTexts.length; i < n; ++i) {
      const subText = subTexts[i];
      let chars = "";
      let charsWidth = 0;
      
      for (let j = 0, m = subText.length; j < m; ++j) {
        const char = subText[j];
        const charDefWithTexture = CharAssembler._getCharDefWithTexture(char, fontString, fontHash);
        const { charDef } = charDefWithTexture;
        if (charsWidth + charDef.w > wrapWidth) {
          if (charsWidth === 0) {
            lines.push(char);
            lineWidths.push(charDef.w);
          } else {
            lines.push(chars);
            lineWidths.push(charsWidth);
            chars = char;
            charsWidth = charDef.xAdvance;
          }
        } else {
          chars += char;
          charsWidth += charDef.xAdvance;
        }
      }

      if (charsWidth > 0) {
        lines.push(chars);
        lineWidths.push(charsWidth);
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
      lineHeight
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
      
      for (let j = 0, m = line.length; j < m; ++j) {
        const charDefWithTexture = CharAssembler._getCharDefWithTexture(line[j], fontString, fontHash);
        curWidth += charDefWithTexture.charDef.xAdvance;
      }
      lineWidths[i] = curWidth;
      if (curWidth > width) {
        width = curWidth;
      }
    }

    return {
      width,
      height,
      lines,
      lineWidths,
      lineHeight
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
      charDefWithTexture = _charUtils.addCharDef(key, TextUtils.textContext().canvas, charMetrics.width, sizeInfo.size, 0, offsetY);
    }

    return charDefWithTexture;
  }
}
