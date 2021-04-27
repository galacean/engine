import { Vector2, Vector3 } from "@oasis-engine/math";
import { Component } from "../Component";
import { Material } from "../material";

export class SpriteMaskElement {
  component: Component;
  positions: Vector3[];
  uv: Vector2[];
  triangles: number[];
  material: Material;
  isAdd: boolean = true;

  setValue(component: Component, positions: Vector3[], uv: Vector2[], triangles: number[], material: Material): void {
    this.component = component;
    this.positions = positions;
    this.uv = uv;
    this.triangles = triangles;
    this.material = material;
  }
}
