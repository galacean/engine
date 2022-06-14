import { Engine } from "../../Engine";
import { Texture2D } from "../../texture";
import { CharDef, FontAtlas } from "../atlas/FontAtlas";
// import { Sprite, SpriteRenderer } from "../sprite";

export interface CharDefWithTexture {
  texture: Texture2D;
  charDef: CharDef;
}

export class CharUtils {
  private _fontAtlasList: Array<FontAtlas> = [];
  private _curFontAtlas: FontAtlas = null;
  private _textureSize: number = 512;
  private _space: number = 0;
  private _curX: number = 1;
  private _curY: number = 1;
  private _nextY: number = 1;

  /**
   * @internal
   */
  constructor(public readonly engine: Engine) {
    this._createFontAtlas();
  }

  addCharDef(
    key: string,
    imageSource: TexImageSource | OffscreenCanvas,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number
  ): CharDefWithTexture {
    const { _space: space, _textureSize: textureSize } = this;

    const endX = this._curX + width + space;
    if (endX >= textureSize) {
      this._curX = space;
      this._curY = this._nextY + space;
    }
    const endY = this._curY + height + space;
    if (endY > this._nextY) {
      this._nextY = endY;
    }

    if (endY >= textureSize) {
      this._createFontAtlas();
      this._curX = 1;
      this._curY = 1;
      this._nextY = 1;
      if (this._curX + width + space >= textureSize || this._curY + height + space >= textureSize) {
        throw Error("The char fontSize is too large.");
      }
    }

    const curTexture = this._curFontAtlas.getTexture();
    if (width > 0 && height > 0) {
      curTexture.setImageSource(imageSource, 0, false, false,  this._curX, this._curY);
      curTexture.generateMipmaps();
    }

    const charDef = {
      x: this._curX,
      y: this._curY,
      w: width,
      h: height,
      offsetX,
      offsetY,
      xAdvance: width + space
    };
    this._curFontAtlas.addCharDef(key, charDef);
    this._curX = endX + space;

    return {
      texture: curTexture,
      charDef
    };
  }

  getCharDef(key: string): CharDefWithTexture {
    const { _fontAtlasList } = this;
    for (let i = 0, l = _fontAtlasList.length; i < l; ++i) {
      const fontAtlas = _fontAtlasList[i];
      const charDef = fontAtlas.getCharDef(key);
      if (charDef) {
        return {
          texture: fontAtlas.getTexture(),
          charDef: charDef
        };
      }
    }
    return null;
  }

  clear(): void {
    this._curFontAtlas = null;
    const { _fontAtlasList } = this;
    for (let i = 0, l = _fontAtlasList.length; i < l; ++i) {
      const fontAtlas = _fontAtlasList[i];
      fontAtlas.destroy();
    }
    _fontAtlasList.length = 0;
  }

  getTextureSize(): number {
    return this._textureSize;
  }

  private _createFontAtlas(): void {
    const { engine, _textureSize } = this;
    const tex = new Texture2D(engine, _textureSize, _textureSize);
    tex._addRefCount(1);
    this._curFontAtlas = new FontAtlas(engine, tex);
    this._fontAtlasList.push(this._curFontAtlas);

    // // 测试代码
    // const scene = engine.sceneManager.activeScene;
    // const rootEntity = scene.getRootEntity();
    // const testEntity = rootEntity.createChild("test");
    // testEntity.transform.setPosition(0, 0, -10);
    // const sprite = new Sprite(engine, tex);
    // testEntity.addComponent(SpriteRenderer).sprite = sprite;
  }
}
