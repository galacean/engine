import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import { ShaderPropertyType } from "./enums/ShaderPropertyType";

/**
 * Shader property.
 */
export class ShaderProperty {
  /** @internal */
  static _propertyIdMap: Record<number, ShaderProperty> = Object.create(null);
  /** @internal */
  static _propertyNameMap: Record<string, ShaderProperty> = Object.create(null);
  /** @internal */
  static _groupConflictVersion: number = 0;

  private static _propertyNameCounter: number = 0;

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

  /** @internal */
  _uniqueId: number;
  /** @internal */
  _groups: ShaderDataGroup = ShaderDataGroup.None;
  /** @internal */
  _types: ShaderPropertyType = ShaderPropertyType.None;

  /** Shader property name. */
  readonly name: string;

  /**
   * Shader property types.
   */
  get types(): ShaderPropertyType {
    return this._types;
  }

  /**
   * @internal
   */
  constructor(name: string) {
    this.name = name;
    this._uniqueId = ShaderProperty._propertyNameCounter++;
  }

  /**
   * @internal
   */
  _addGroup(group: ShaderDataGroup): void {
    const groups = this._groups;
    if ((groups & group) === 0) {
      this._groups = groups | group;
      groups !== ShaderDataGroup.None && ShaderProperty._groupConflictVersion++;
    }
  }
}
