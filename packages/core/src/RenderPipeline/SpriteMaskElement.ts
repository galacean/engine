import { Vector2, Vector3 } from "@oasis-engine/math";
import { Camera } from "../Camera";
import { Component } from "../Component";
import { Material } from "../material/Material";

export class SpriteMaskElement {
  component: Component;
  positions: Vector3[];
  uv: Vector2[];
  triangles: number[];
  material: Material;
  isAdd: boolean = true;
  camera: Camera;

  setValue(component: Component, positions: Vector3[], uv: Vector2[], triangles: number[], material: Material): void {
    this.component = component;
    this.positions = positions;
    this.uv = uv;
    this.triangles = triangles;
    this.material = material;
  }
}
