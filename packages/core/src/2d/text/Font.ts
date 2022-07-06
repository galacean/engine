import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { FontAtlas } from "../atlas/FontAtlas";

/**
 * Font.
 */
export class Font extends RefObject {
  private static _fontMap: Record<string, Font> = {};

  /**
   * Create a font from OS.
   * @param engine - Engine to which the font belongs
   * @param name - The name of font
   * @returns The font object has been create
   */
  static createFromOS(engine: Engine, name: string = ""): Font {
    const fontMap = Font._fontMap;
    let font = fontMap[name];
    if (font) {
      return font;
    }
    font = new Font(engine, name);
    fontMap[name] = font;
    return font;
  }

  private _name: string = "";
  private _fontName: string = "";
  private _fontAtlasArray: Array<FontAtlas> = [];

  /**
   * The name of the font object.
   */
  get name(): string {
    return this._name;
  }

  /**
   * The font name for Canvas.
   */
  get fontName(): string {
    return this._fontName;
  }

  set fontName(value: string) {
    this._fontName = value;
  }

  /**
   * @override
   */
  protected _onDestroy(): void {}

  private constructor(engine: Engine, name: string = "") {
    super(engine);
    this._name = name;
  }
}
