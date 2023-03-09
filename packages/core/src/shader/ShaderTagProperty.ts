/**
 * Shader tag property.
 */
export class ShaderTagProperty {
  private static _nameCounter: number = 0;
  private static _nameMap: Record<string, ShaderTagProperty> = Object.create(null);

  /**
   * Get shader property by name.
   * @param name - Name of the shader property
   * @returns Shader property
   */
  static getByName(name: string): ShaderTagProperty {
    const nameMap = ShaderTagProperty._nameMap;
    return (nameMap[name] ||= new ShaderTagProperty(name));
  }

  /** Shader tag property name. */
  readonly name: string;

  /** @internal */
  _uniqueId: number;

  private constructor(name: string) {
    this.name = name;
    this._uniqueId = ShaderTagProperty._nameCounter++;
  }
}
