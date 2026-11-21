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
  _group: number = 0;
  /** @internal */
  _type: ShaderPropertyType = ShaderPropertyType.None;

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

  /**
   * @internal
   */
  _isMultiGroup(): boolean {
    const group = this._group;
    return (group & (group - 1)) !== 0;
  }

  /**
   * @internal
   */
  _addGroup(group: ShaderDataGroup): void {
    const current = this._group;
    if ((current & group) === 0) {
      this._group = current | group;
      current !== 0 && ShaderProperty._groupConflictVersion++;
    }
  }
}
