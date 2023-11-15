import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import { ShaderPropertyType } from "./enums/ShaderPropertyType";

/**
 * Shader property.
 */
export class ShaderProperty {
  /** @internal */
  static _propertyIdMap: Record<number, ShaderProperty> = Object.create(null);

  private static _propertyNameCounter: number = 0;
  private static _propertyNameMap: Record<string, ShaderProperty> = Object.create(null);

  /**
   * Get shader property by name.
   * @param name - Name of the shader property
   * @returns Shader property
   */
  static getByName(name: string): ShaderProperty {
    const propertyNameMap = ShaderProperty._propertyNameMap;
    if (propertyNameMap[name] != null) {
      return propertyNameMap[name];
    } else {
      const property = new ShaderProperty(name);
      propertyNameMap[name] = property;
      ShaderProperty._propertyIdMap[property._uniqueId] = property;
      return property;
    }
  }

  /**
   * @internal
   */
  static _getShaderPropertyGroup(propertyName: string): ShaderDataGroup | null {
    const shaderProperty = ShaderProperty._propertyNameMap[propertyName];
    return shaderProperty?._group;
  }

  /** @internal */
  _uniqueId: number;
  /** @internal */
  _group: ShaderDataGroup;
  /** @internal */
  _type: ShaderPropertyType;

  /** Shader property name. */
  readonly name: string;

  /**
   * Shader property type.
   */
  get type(): ShaderPropertyType {
    return this._type;
  }

  /**
   * @internal
   */
  constructor(name: string) {
    this.name = name;
    this._uniqueId = ShaderProperty._propertyNameCounter++;
  }
}
