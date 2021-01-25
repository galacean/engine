/**
 * Shader macro。
 */
export class ShaderMacro {
  /** name */
  readonly name: string;

  /** @internal */
  _index: number;
  /** @internal */
  _value: number;

  /**
   * @internal
   */
  constructor(name: string, index: number, value: number) {
    this.name = name;
    this._index = index;
    this._value = value;
  }
}
