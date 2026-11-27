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

  /** @internal Built-in global uniforms retain their ShaderData override order when packed in their owner's block. */
  static _getBuiltinGlobal(name: string, group: ShaderDataGroup.Camera | ShaderDataGroup.Scene): ShaderProperty {
    const property = ShaderProperty.getByName(name);
    property._builtinGlobalGroup = group;
    property._requiresSharedInstanceValue = true;
    return property;
  }

  /** @internal */
  _uniqueId: number;
  /** @internal */
  _groups: ShaderDataGroup = ShaderDataGroup.None;
  /** @internal */
  _builtinGlobalGroup: ShaderDataGroup = ShaderDataGroup.None;
  /** @internal A renderer override for this field remains shared by an entire instanced draw. */
  _requiresSharedInstanceValue: boolean;
  /** @internal Set when a shader pass uses this property to control its render state. */
  _controlsRenderState = false;
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
    this._requiresSharedInstanceValue = name.includes(".") || name.includes("[");
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
