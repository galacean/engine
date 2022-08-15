import { RenderData2D } from "../2d/data/RenderData2D";
import { Component } from "../Component";
import { Material } from "../material/Material";

export class SpriteMaskElement {
  component: Component;
  renderData: RenderData2D;
  material: Material;
  isAdd: boolean = true;

  setValue(component: Component, renderData: RenderData2D, material: Material): void {
    this.component = component;
    this.renderData = renderData;
    this.material = material;
  }
}
