/**
 * Shader macro。
 */
export class ShaderMacro {
  /** @internal */
  static _macroNameIdMap: Record<string, number> = Object.create(null);

  private static _macroNameCounter: number = 0;

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

  /**
   * @internal
   */
  constructor(name: string, value: string, maskIndex: number, maskValue: number) {
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
