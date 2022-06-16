import { Color, Vector2, Vector3 } from "@oasis-engine/math";
import { Texture2D } from "../../texture";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";
import { TextRenderer, DirtyFlag } from "../text/TextRenderer";
import { TextUtils, TextMetrics } from "../text/TextUtils";
import { IAssembler } from "./IAssembler";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";

@StaticInterfaceImplement<IAssembler>()
export class TextAssembler {
  private static _tempVec2: Vector2 = new Vector2();
  private static _tempVec3: Vector3 = new Vector3();
  private static _maxWidth: number = 1024;
  private static _maxHeight: number = 1024;

  static resetData(renderer: TextRenderer) {
    const positions: Array<Vector3> = [];
    const uvs: Array<Vector2> = [];
    const triangles: Array<number> = [];
    const color: Color = null;

    positions[0] = new Vector3();
    positions[1] = new Vector3();
    positions[2] = new Vector3();
    positions[3] = new Vector3();
    triangles[0] = 0, triangles[1] = 2, triangles[2] = 1;
    triangles[3] = 2, triangles[4] = 0, triangles[5] = 3;

    renderer._renderData = { positions, uvs, triangles, color, vertexCount: 4, texture: null };
  }

  static updateData(renderer: TextRenderer): void {
    const isTextureDirty = renderer._isContainDirtyFlag(DirtyFlag.Property);
    if (isTextureDirty) {
      TextAssembler._updateText(renderer);
      renderer._setDirtyFlagFalse(DirtyFlag.Property);
    }

    if (renderer._isWorldMatrixDirty.flag || isTextureDirty) {
      TextAssembler._updatePosition(renderer);
      renderer._isWorldMatrixDirty.flag = false;
    }

    renderer._renderData.color = renderer.color;
  }

  static clearData(renderer: TextRenderer): void {
    const { positions, uvs, triangles } = renderer._renderData;
    positions.length = 0;
    uvs.length = 0;
    triangles.length = 0;
    renderer._renderData = null;
  }

  private static _updatePosition(renderer: TextRenderer): void {
    const localPositions = renderer._sprite._positions;
    const localVertexPos = TextAssembler._tempVec3;
    const worldMatrix = renderer.entity.transform.worldMatrix;

    const { positions: _positions } = renderer._renderData;
    for (let i = 0, n = _positions.length; i < n; i++) {
      const curVertexPos = localPositions[i];
      localVertexPos.setValue(curVertexPos.x, curVertexPos.y, 0);
      Vector3.transformToVec3(localVertexPos, worldMatrix, _positions[i]);
    }
  }

  private static _updateText(renderer: TextRenderer): void {
    const { width: originWidth, height: originHeight, enableWrapping, overflowMode } = renderer;
    const fontString = TextUtils.getNativeFontString(renderer.font.name, renderer.fontSize, renderer.fontStyle);
    const textMetrics = TextAssembler._measureText(
      renderer.text,
      originWidth,
      originHeight,
      renderer.lineSpacing,
      enableWrapping,
      overflowMode,
      fontString
    );
    TextAssembler._fillText(textMetrics, fontString, renderer.horizontalAlignment, renderer.verticalAlignment);
    TextAssembler._updateTexture(renderer);
  }

  private static _measureText(
    text: string,
    originWidth: number,
    originHeight: number,
    lineSpacing: number,
    enableWrapping: boolean,
    overflowMode: OverflowMode,
    fontString: string
  ): TextMetrics {
    const { _pixelsPerUnit } = TextUtils;
    const fontSize = TextUtils.measureFont(fontString).size;
    const context = TextUtils.textContext().context;
    const lines = TextAssembler._wordWrap(text, originWidth, enableWrapping, fontString);
    const lineCount = lines.length;
    const lineWidths = new Array<number>();
    const lineHeight = fontSize + lineSpacing * _pixelsPerUnit;
    context.font = fontString;
    // Calculate max width of all lines.
    let width = 0;
    for (let i = 0; i < lineCount; ++i) {
      const lineWidth = context.measureText(lines[i]).width;
      if (lineWidth > width) {
        width = lineWidth;
      }
      lineWidths.push(lineWidth);
    }

    // Reset width and height.
    let height = originHeight * _pixelsPerUnit;
    if (overflowMode === OverflowMode.Overflow) {
      height = Math.min(lineHeight * lineCount, TextAssembler._maxHeight);
    }

    return {
      width,
      height,
      lines,
      lineWidths,
      lineHeight
    };
  }

  private static _fillText(
    textMetrics: TextMetrics,
    fontString: string,
    horizontalAlignment: TextHorizontalAlignment,
    verticalAlignment: TextVerticalAlignment
  ): void {
    const { canvas, context } = TextUtils.textContext();
    const { width, height } = textMetrics;
    // reset canvas's width and height.
    canvas.width = width;
    canvas.height = height;
    // clear canvas.
    context.font = fontString;
    context.clearRect(0, 0, width, height);
    // set canvas font info.
    context.textBaseline = "middle";
    context.fillStyle = "#fff";

    // draw lines.
    const { lines, lineHeight, lineWidths } = textMetrics;
    const halfLineHeight = lineHeight * 0.5;
    for (let i = 0, l = lines.length; i < l; ++i) {
      const lineWidth = lineWidths[i];
      const pos = TextAssembler._tempVec2;
      TextAssembler._calculateLinePosition(
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

  private static _updateTexture(renderer: TextRenderer): void {
    const trimData = TextUtils.trimCanvas();
    const { width, height } = trimData;
    const canvas = TextUtils.updateCanvas(width, height, trimData.data);
    renderer._clearTexture();

    const { _sprite: sprite, horizontalAlignment, verticalAlignment } = renderer;

    // Handle the case that width or height of text is larger than real width or height.
    const { pixelsPerUnit, pivot } = sprite;
    switch (horizontalAlignment) {
      case TextHorizontalAlignment.Left:
        pivot.x = (renderer.width * pixelsPerUnit) / width * 0.5;
        break;
      case TextHorizontalAlignment.Right:
        pivot.x = 1 - (renderer.width * pixelsPerUnit) / width * 0.5;
        break;
      case TextHorizontalAlignment.Center:
        pivot.x = 0.5;
        break;
    }
    switch (verticalAlignment) {
      case TextVerticalAlignment.Top:
        pivot.y = 1 - (renderer.height * pixelsPerUnit) / height * 0.5;
        break;
      case TextVerticalAlignment.Bottom:
        pivot.y = (renderer.height * pixelsPerUnit) / height * 0.5;
        break;
      case TextVerticalAlignment.Center:
        pivot.y = 0.5;
        break;
    }
    sprite.pivot = pivot;

    // If add fail, set texture for sprite.
    if (!renderer.engine._dynamicTextAtlasManager.addSprite(sprite, canvas)) {
      const texture = new Texture2D(renderer.engine, width, height);
      texture.setImageSource(canvas);
      texture.generateMipmaps();
      sprite.texture = texture;
    }
    // Update sprite data.
    sprite._updateMesh();
    renderer._renderData.uvs = sprite._uv;
  }

  private static _wordWrap(text: string, width: number, enableWrapping: boolean, fontString: string): Array<string> {
    const { context } = TextUtils.textContext();
    const { _maxWidth: maxWidth } = TextAssembler;
    const widthInPixel = width * TextUtils._pixelsPerUnit;
    const wrapWidth = Math.min(widthInPixel, maxWidth);
    const wrappedSubTexts = new Array<string>();
    const subTexts = text.split(/(?:\r\n|\r|\n)/);
    context.font = fontString;

    for (let i = 0, n = subTexts.length; i < n; ++i) {
      const subText = subTexts[i];
      const subWidth = context.measureText(subText).width;
      const needWrap = enableWrapping || subWidth > maxWidth;

      if (needWrap) {
        const autoWrapWidth = enableWrapping  ? wrapWidth : maxWidth;
        if (subWidth <= autoWrapWidth) {
          wrappedSubTexts.push(subText);
        } else {
          let chars = "";
          let charsWidth = 0;
          for (let j = 0, m = subText.length; j < m; ++j) {
            const char = subText[j];
            const charWidth = context.measureText(char).width;
            if (charsWidth + charWidth > autoWrapWidth) {
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
