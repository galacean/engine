import { SubMesh } from "../graphic";
import { Primitive } from "../graphic/Primitive";
import { Material } from "../material";
import { Renderer } from "../Renderer";
import { IPoolElement } from "../utils/Pool";
import { RenderDataUsage } from "./enums/RenderDataUsage";

export class RenderData implements IPoolElement {
  component: Renderer;
  material: Material;
  primitive: Primitive;
  subPrimitive: SubMesh;
  usage: RenderDataUsage = RenderDataUsage.Mesh;

  /** @internal */
  _priority: number;
  /** @internal */
  _materialPriority: number;
  /** @internal */
  _componentInstanceId: number;
  /** @internal */
  _distanceForSort: number;

  set(component: Renderer, material: Material, primitive: Primitive, subPrimitive: SubMesh): void {
    this.component = component;
    this.material = material;

    this.primitive = primitive;
    this.subPrimitive = subPrimitive;

    this._priority = component.priority;
    this._materialPriority = material._priority;
    this._componentInstanceId = component.instanceId;
    this._distanceForSort = component._distanceForSort;
  }

  dispose(): void {
    this.component = null;
    this.material = null;
    this.primitive = null;
    this.subPrimitive = null;
  }
}
