import { Engine } from "../../Engine";
import { Texture2D } from "../../texture";
import { DynamicFontAtlas } from "../atlas/DynamicFontAtlas";
import { CharDef } from "../atlas/FontAtlas";

/**
 * @internal
 */
export interface CharDefWithTexture {
  texture: Texture2D;
  charDef: CharDef;
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

  addCharDef(
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
  ): CharDefWithTexture {
    const { _fontAtlasListMap } = this;
    let fontAtlasList = _fontAtlasListMap[fontHash];
    if (!fontAtlasList) {
      fontAtlasList = _fontAtlasListMap[fontHash] = [new DynamicFontAtlas(this.engine)];
    }

    const lastIndex = fontAtlasList.length - 1;
    let lastFontAtlas = fontAtlasList[lastIndex];
    let charDef = lastFontAtlas.addCharDefDynamic(id, imageSource, width, height, offsetX, offsetY, xAdvance, ascent, descent);
    if (!charDef) {
      lastFontAtlas = new DynamicFontAtlas(this.engine);
      fontAtlasList.push(lastFontAtlas);
      charDef = lastFontAtlas.addCharDefDynamic(id, imageSource, width, height, offsetX, offsetY, xAdvance, ascent, descent);
    }
    return charDef ? { charDef, texture: lastFontAtlas.texture } : null;
  }

  getCharDef(fontHash: string, id: number): CharDefWithTexture {
    let fontAtlasList = this._fontAtlasListMap[fontHash];
    if (fontAtlasList) {
      for (let i = 0, l = fontAtlasList.length; i < l; ++i) {
        const fontAtlas = fontAtlasList[i];
        const charDef = fontAtlas.getCharDef(id);
        if (charDef) {
          return {
            charDef,
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
