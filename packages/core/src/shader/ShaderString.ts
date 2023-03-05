/**
 * ShaderString is a class that represents a shader string.
 */
export class ShaderString {
  private static _nameCounter: number = 0;
  private static _nameMap: Record<string, ShaderString> = Object.create(null);
  private static _idMap: Record<number, ShaderString> = Object.create(null);

  /**
   * Get shader property by name.
   * @param name - Name of the shader property
   * @returns Shader property
   */
  static getByName(name: string): ShaderString {
    const propertyNameMap = ShaderString._nameMap;
    if (propertyNameMap[name] != null) {
      return propertyNameMap[name];
    } else {
      const property = new ShaderString(name);
      propertyNameMap[name] = property;
      ShaderString._idMap[property._uniqueId] = property;
      return property;
    }
  }

  /** Shader property name. */
  readonly name: string;

  /** @internal */
  _uniqueId: number;

  private constructor(name: string) {
    this.name = name;
    this._uniqueId = ShaderString._nameCounter++;
  }
}
