import { ShaderMacroCollection } from "./ShaderMacroCollection";

/**
 * Shader macro。
 */
export class ShaderMacro {
  /** @internal */
  static _macroMaskMap: ShaderMacro[][] = [];
  /** @internal */
  static _macroNameIdMap: Record<string, number> = Object.create(null);

  private static _macroNameCounter: number = 0;
  private static _macroCounter: number = 0;
  private static _macroMap: Record<string, ShaderMacro> = Object.create(null);

  /**
   * Get shader macro by name.
   * @param name - Name of the shader macro
   * @returns Shader macro
   */
  static getByName(name: string): ShaderMacro;

  /**
   * Get shader macro by name.
   * @param name - Name of the shader macro
   * @param value - Value of the shader macro
   * @returns Shader macro
   */
  static getByName(name: string, value: string): ShaderMacro;

  static getByName(name: string, value?: string): ShaderMacro {
    const key = value ? name + ` ` + value : name;
    let macro = ShaderMacro._macroMap[key];
    if (!macro) {
      const maskMap = ShaderMacro._macroMaskMap;
      const counter = ShaderMacro._macroCounter;
      const index = Math.floor(counter / 32);
      const bit = counter % 32;

      macro = new ShaderMacro(name, value, index, 1 << bit);
      ShaderMacro._macroMap[key] = macro;
      if (index == maskMap.length) {
        maskMap.length++;
        maskMap[index] = new Array<ShaderMacro>(32);
      }
      maskMap[index][bit] = macro;
      ShaderMacro._macroCounter++;
    }
    return macro;
  }

  /**
   * @internal
   */
  static _getMacrosElements(macros: ShaderMacroCollection, out: ShaderMacro[]): void {
    const maskMap = ShaderMacro._macroMaskMap;
    const mask = macros._mask;
    out.length = 0;
    for (let i = 0, n = macros._length; i < n; i++) {
      const subMaskMap = maskMap[i];
      const subMask = mask[i];
      const m = subMask < 0 ? 32 : Math.floor(Math.log2(subMask)) + 1; // if is negative must contain 1 << 31.
      for (let j = 0; j < m; j++) {
        if (subMask & (1 << j)) {
          out.push(subMaskMap[j]);
        }
      }
    }
  }

  /** Name. */
  readonly name: string;
  /** Value. */
  readonly value: string;

  /** @internal */
  _nameId: number;
  /** @internal */
  _maskIndex: number;
  /** @internal */
  _maskValue: number;

  private constructor(name: string, value: string, maskIndex: number, maskValue: number) {
    this.name = name;
    this._maskIndex = maskIndex;
    this._maskValue = maskValue;
    this.value = value;

    const macroNameIDMap = ShaderMacro._macroNameIdMap;
    let nameID = macroNameIDMap[name];
    if (macroNameIDMap[name] === undefined) {
      macroNameIDMap[name] = nameID = ShaderMacro._macroNameCounter++;
    }
    this._nameId = nameID;
  }
}
