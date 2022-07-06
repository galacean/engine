import { Engine } from "../../Engine";
import { Texture2D } from "../../texture";
import { DynamicFontAtlas } from "../atlas/DynamicFontAtlas";
import { CharInfo } from "./CharInfo";

/**
 * @internal
 */
export interface CharInfoWithTexture {
  texture: Texture2D;
  charInfo: CharInfo;
}

/**
 * @internal
 */
export class CharUtils {
  private _fontAtlasListMap: Record<string, Array<DynamicFontAtlas>> = {};

  /**
   * @internal
   */
  constructor(public readonly engine: Engine) {}

  addCharInfo(
    fontHash: string,
    id: number,
    imageSource: TexImageSource | OffscreenCanvas,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    xAdvance: number,
    ascent: number,
    descent: number,
  ): CharInfoWithTexture {
    const { _fontAtlasListMap } = this;
    let fontAtlasList = _fontAtlasListMap[fontHash];
    if (!fontAtlasList) {
      fontAtlasList = _fontAtlasListMap[fontHash] = [new DynamicFontAtlas(this.engine)];
    }

    const lastIndex = fontAtlasList.length - 1;
    let lastFontAtlas = fontAtlasList[lastIndex];
    let charInfo = lastFontAtlas.addCharInfoDynamic(id, imageSource, width, height, offsetX, offsetY, xAdvance, ascent, descent);
    if (!charInfo) {
      lastFontAtlas = new DynamicFontAtlas(this.engine);
      fontAtlasList.push(lastFontAtlas);
      charInfo = lastFontAtlas.addCharInfoDynamic(id, imageSource, width, height, offsetX, offsetY, xAdvance, ascent, descent);
    }
    return charInfo ? { charInfo: charInfo, texture: lastFontAtlas.texture } : null;
  }

  getCharInfo(fontHash: string, id: number): CharInfoWithTexture {
    let fontAtlasList = this._fontAtlasListMap[fontHash];
    if (fontAtlasList) {
      for (let i = 0, l = fontAtlasList.length; i < l; ++i) {
        const fontAtlas = fontAtlasList[i];
        const charInfo = fontAtlas.getCharInfo(id);
        if (charInfo) {
          return {
            charInfo: charInfo,
            texture: fontAtlas.texture
          }
        }
      }
    }
    return null;
  }

  clear(): void {
    const { _fontAtlasListMap } = this;
    Object.keys(_fontAtlasListMap).forEach((key) => {
      const fontAtlasList = _fontAtlasListMap[key];
      for (let i = 0, l = fontAtlasList.length; i < l; ++i) {
        fontAtlasList[i].destroy();
      }
      fontAtlasList.length = 0;
      delete _fontAtlasListMap[key];
    });
  }
}
