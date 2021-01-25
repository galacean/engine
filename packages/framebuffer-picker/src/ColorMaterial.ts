import { Engine, Logger, Material, RenderElement, Shader, Vector3 } from "oasis-engine";
import fs from "./color.fs.glsl";
import vs from "./color.vs.glsl";

Shader.create("framebuffer-picker-color", vs, fs);

/**
 * Color material, render as marker.
 */
export class ColorMaterial extends Material {
  private _currentId: number = 0;
  private _primitivesMap = [];

  constructor(engine: Engine) {
    super(engine, Shader.find("framebuffer-picker-color"));
  }

  /**
   * Reset id and renderer element table.
   */
  reset(): void {
    this._currentId = 0;
    this._primitivesMap = [];
  }

  /**
   * Convert id to RGB color value, 0 and 0xffffff are illegal values.
   */
  id2Color(id: number): Vector3 {
    if (id >= 0xffffff) {
      Logger.warn("Framebuffer Picker encounter primitive's id greater than " + 0xffffff);
      return new Vector3(0, 0, 0);
    }

    const color = new Vector3((id & 0xff) / 255, ((id & 0xff00) >> 8) / 255, ((id & 0xff0000) >> 16) / 255);
    return color;
  }

  /**
   * Convert RGB color to id.
   * @param color - Color
   */
  color2Id(color): number {
    return color[0] | (color[1] << 8) | (color[2] << 16);
  }

  /**
   * Get renderer element by color.
   */
  getObjectByColor(color) {
    return this._primitivesMap[this.color2Id(color)];
  }

  /**
   * @override
   */
  _preRender(renderElement: RenderElement) {
    const { component, primitive } = renderElement;
    this._currentId += 1;
    this._primitivesMap[this._currentId] = { component, primitive };
    component.shaderData.setVector3("u_colorId", this.id2Color(this._currentId));
  }
}
