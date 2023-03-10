/**
 * Shader tag.
 */
export class ShaderTag {
  private static _nameCounter: number = 0;
  private static _nameMap: Record<string, ShaderTag> = Object.create(null);

  /**
   * Get shader property by name.
   * @param name - Name of the shader property
   * @returns Shader property
   */
  static getByName(name: string): ShaderTag {
    const nameMap = ShaderTag._nameMap;
    return (nameMap[name] ||= new ShaderTag(name));
  }

  /** Shader tag property name. */
  readonly name: string;

  /** @internal */
  _uniqueId: number;

  private constructor(name: string) {
    this.name = name;
    this._uniqueId = ShaderTag._nameCounter++;
  }
}
