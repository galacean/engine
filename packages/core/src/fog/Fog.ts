import { Color } from "@oasis-engine/math";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { Shader } from "../shader/Shader";

/**
 * Fog.
 */
export class Fog extends Component {
  protected static _colorProperty = Shader.getPropertyByName("u_fogColor");

  /**
   * Fog color.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    this._color = value;
    this.scene.shaderData.setColor(Fog._colorProperty, value);
  }

  private _color: Color = new Color(1, 0, 0, 1);

  constructor(entity: Entity) {
    super(entity);
    this.color = this._color;
  }

  /**
   * @internal
   * @override
   */
  _onEnable() {
    this.scene.shaderData.enableMacro("O3_HAS_FOG");
  }

  /**
   * @internal
   * @override
   */
  _onDisable() {
    this.scene.shaderData.disableMacro("O3_HAS_FOG");
  }
}
