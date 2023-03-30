import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import { ShaderPropertyType } from "./enums/ShaderPropertyType";

/**
 * Shader property.
 */
export class ShaderProperty {
  private static _propertyNameCounter: number = 0;

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
