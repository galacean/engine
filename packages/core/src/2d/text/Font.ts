import { ReferResource } from "../../asset/ReferResource";
import { Engine } from "../../Engine";
import { FontStyle } from "../enums/FontStyle";
import { SubFont } from "./SubFont";

/**
 * Font.
 */
export class Font extends ReferResource {
  /**
   * Create a system font.
   * @param engine - Engine to which the font belongs
   * @param name - The name of font want to create
   * @returns The font object has been create
   */
  static createFromOS(engine: Engine, name: string): Font {
    if (name) {
      const fontMap = engine._fontMap;
      let font = fontMap[name];
      if (font) {
        return font;
      }
      font = new Font(engine, name);
      fontMap[name] = font;
      return font;
    }
    return null;
  }

  private _name: string = "";
  private _subFontMap: Record<string, SubFont> = {};

  /**
   * The name of the font object.
   */
  get name(): string {
    return this._name;
  }

  constructor(engine: Engine, name: string = "") {
    super(engine);
    this._name = name;
  }

  /**
   * @internal
   */
  _getSubFont(fontSize: number, fontStyle: FontStyle): SubFont {
    const key = `${fontSize}-${fontStyle}`;
    const subFontMap = this._subFontMap;
    let subFont = subFontMap[key];
    if (subFont) {
      return subFont;
    }
    subFont = new SubFont(this.engine);
    subFontMap[key] = subFont;
    return subFont;
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    const subFontMap = this._subFontMap;
    for (let k in subFontMap) {
      subFontMap[k].destroy();
    }
    this._subFontMap = null;
    delete this.engine._fontMap[this._name];
  }
}
