import { RefObject } from "../../asset/RefObject"
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
  static createFromOS(engine: Engine, fontName: string = ""): Font{
    const fontMap = Font._fontMap;
    if (fontMap[fontName]) {
      return fontMap[fontName];
    }
    return (fontMap[fontName] = new Font(engine, fontName));
  }

  private _name: string = "";

  /**
   * The name of the font object.
   */
  get name(): string {
    return this._name;
  }

  /**
   * Create a font instance.
   * @param engine - Engine to which the font belongs
   * @param name - The name of font
   */
  private constructor(engine: Engine, name: string = "") {
    super(engine);
    this._name = name;
  }

  /**
   * @override
   */
  protected _onDestroy(): void {}
}

