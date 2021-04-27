import { ShaderDataGroup } from "./enums/ShaderDataGroup";

/**
 * Shader property.
 */
export class ShaderProperty {
  private static _propertyNameCounter: number = 0;

  /** @internal */
  _uniqueId: number;
  /** @internal */
  _group: ShaderDataGroup;

  /** Shader property name. */
  readonly name: string;

  /**
   * @internal
   */
  constructor(name: string) {
    this.name = name;
    this._uniqueId = ShaderProperty._propertyNameCounter++;
  }
}
