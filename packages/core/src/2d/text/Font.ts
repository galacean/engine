import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";

/**
 * Font.
 */
export class Font extends RefObject {
  private static _fontMap: Record<string, Font> = {};

  /**
   * Create a font from OS.
   * @param engine - Engine to which the font belongs
   * @param fontName - The name of font
   * @returns The font object has been create
   */
  static createFromOS(engine: Engine, fontName: string = ""): Font {
    const fontMap = Font._fontMap;
    let font = fontMap[fontName];
    if (font) {
      return font;
    }
    font = new Font(engine, fontName);
    fontMap[fontName] = font;
    return font;
  }

  private _name: string = "";

  /**
   * The name of the font object.
   */
  get name(): string {
    return this._name;
  }

  private constructor(engine: Engine, name: string = "") {
    super(engine);
    this._name = name;
  }

  /**
   * @override
   */
  protected _onDestroy(): void {}
}
