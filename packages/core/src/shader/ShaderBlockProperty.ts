/**
 * @internal
 * Shader block property, used to identify uniform blocks by id.
 */
export class ShaderBlockProperty {
  private static _counter = 0;
  private static _nameMap: Record<string, ShaderBlockProperty> = Object.create(null);

  /**
   * Get shader block property by name.
   * @param name - Name of the uniform block
   * @returns Shader block property
   */
  static getByName(name: string): ShaderBlockProperty {
    const nameMap = ShaderBlockProperty._nameMap;
    return nameMap[name] ?? (nameMap[name] = new ShaderBlockProperty(name));
  }

  /** Uniform block name. */
  readonly name: string;
  /** @internal */
  readonly _uniqueId: number;

  private constructor(name: string) {
    this.name = name;
    this._uniqueId = ShaderBlockProperty._counter++;
  }
}
