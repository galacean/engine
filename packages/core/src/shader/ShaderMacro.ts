/**
 * Shader macro。
 */
export class ShaderMacro {
  /** @internal */
  static _macroNameIDMap: Record<string, number> = Object.create(null);

  private static _macroNameCounter: number = 0;

  /** Name. */
  readonly name: string;
  /** Value. */
  readonly value: string;

  /** @internal */
  _nameID: number;
  /** @internal */
  _index: number;
  /** @internal */
  _maskValue: number;

  /**
   * @internal
   */
  constructor(name: string, index: number, maskValue: number, value?: string) {
    this.name = name;
    this._index = index;
    this._maskValue = maskValue;
    this.value = value;

    const macroNameIDMap = ShaderMacro._macroNameIDMap;
    let nameID = macroNameIDMap[name];
    if (macroNameIDMap[name] === undefined) {
      macroNameIDMap[name] = nameID = ShaderMacro._macroNameCounter++;
    }
    this._nameID = nameID;
  }
}
