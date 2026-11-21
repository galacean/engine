import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import { ShaderPropertyType } from "./enums/ShaderPropertyType";

/**
 * Shader property.
 */
export class ShaderProperty {
  /** @internal */
  static _propertyIdMap: Record<number, ShaderProperty> = Object.create(null);
  /** @internal Increments whenever a property starts being shared by multiple groups */
  static _groupConflictVersion: number = 0;

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
  static _getShaderPropertyGroup(propertyName: string): ShaderDataGroup | undefined {
    return ShaderProperty._propertyNameMap[propertyName]?._getGroup();
  }

  /** @internal */
  _uniqueId: number;
  /** @internal Bit mask of every group this property has been set in */
  _groupMask: number = 0;
  /** @internal The first type this property was set with */
  _type: ShaderPropertyType;
  /** @internal Whether the property has been set with more than one type */
  _hasTypeConflict: boolean = false;

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
  _getGroup(): ShaderDataGroup | undefined {
    const mask = this._groupMask;
    // Zero or multiple bits set means the group is unknown or ambiguous
    if (mask === 0 || (mask & (mask - 1)) !== 0) {
      return undefined;
    }
    return <ShaderDataGroup>(31 - Math.clz32(mask));
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
      // The property becomes shared by multiple groups, programs must regroup it
      mask !== 0 && ShaderProperty._groupConflictVersion++;
    }
  }
}
