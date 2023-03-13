/**
 * Shader tag key.
 */
export class ShaderTagKey {
  private static _nameCounter: number = 0;
  private static _nameMap: Record<string, ShaderTagKey> = Object.create(null);

  /**
   * Get shader property by name.
   * @param name - Name of the shader property
   * @returns Shader property
   */
  static getByName(name: string): ShaderTagKey {
    const nameMap = ShaderTagKey._nameMap;
    return (nameMap[name] ||= new ShaderTagKey(name));
  }

  /** Shader tag property name. */
  readonly name: string;

  /** @internal */
  _uniqueId: number;

  private constructor(name: string) {
    this.name = name;
    this._uniqueId = ShaderTagKey._nameCounter++;
  }
}
