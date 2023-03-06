/**
 * ShaderString is a class that represents a shader string.
 */
export class ShaderString {
  private static _nameCounter: number = 0;
  private static _nameMap: Record<string, ShaderString> = Object.create(null);

  /**
   * Get shader property by name.
   * @param name - Name of the shader property
   * @returns Shader property
   */
  static getByName(name: string): ShaderString {
    const nameMap = ShaderString._nameMap;
    return (nameMap[name] ||= new ShaderString(name));
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
