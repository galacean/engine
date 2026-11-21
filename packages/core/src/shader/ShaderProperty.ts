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
  _groupMask: number = 0;
  /** @internal */
  _typeMask: number = 0;

  /** Shader property name. */
  readonly name: string;

  /**
   * Shader property type.
   */
  get type(): ShaderPropertyType {
    const mask = this._typeMask;
    return <ShaderPropertyType>(mask !== 0 && (mask & (mask - 1)) === 0 ? 31 - Math.clz32(mask) : undefined);
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
    const mask = this._groupMask;
    return (mask & (mask - 1)) !== 0;
  }

  /**
   * @internal
   */
  _addGroup(group: ShaderDataGroup): void {
    const mask = this._groupMask;
    const bit = 1 << group;
    if ((mask & bit) === 0) {
      this._groupMask = mask | bit;
      mask !== 0 && ShaderProperty._groupConflictVersion++;
    }
  }
}
