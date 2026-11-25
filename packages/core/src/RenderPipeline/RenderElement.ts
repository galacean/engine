import type { Vector4 } from "@galacean/engine-math";
import type { IMaskRenderable } from "../2d/sprite/MaskRenderable";
import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { Renderer } from "../Renderer";
import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material";
import { ShaderData, SubShader } from "../shader";
import { Texture2D } from "../texture";
import { IPoolElement } from "../utils/ObjectPool";
import { SubPrimitiveChunk } from "./SubPrimitiveChunk";

/** Resolved UI coverage needed by the stencil pass. Shared by draws in the same scope. */
interface UIStencilClip {
  readonly masks: readonly IMaskRenderable[];
  readonly outsideRects: readonly Vector4[];
  readonly axisX: Vector4;
  readonly axisY: Vector4;
}

export class RenderElement implements IPoolElement {
  /** @internal Null for draws using scene SpriteMask layers. */
  _uiClip: UIStencilClip | null = null;

  /** @internal */
  get _usesUIStencil(): boolean {
    const clip = this._uiClip;
    return (
      !!clip &&
      (clip.outsideRects.length > 0 ||
        (this.component._maskInteraction !== SpriteMaskInteraction.None && clip.masks.length > 0))
    );
  }

  priority: number;
  distanceForSort: number;
  component: Renderer;
  primitive: Primitive;
  material: Material;
  subPrimitive: SubMesh;
  subShader: SubShader;
  shaderData?: ShaderData;
  instancedRenderers: Renderer[] = [];
  subDistancePriority: number = 0;
  /** @internal Marks a batch leader — a self-contained draw range that must not be merged again downstream */
  _isBatched: boolean = false;

  // @todo: maybe should remove later
  texture?: Texture2D;
  subChunk?: SubPrimitiveChunk;

  set(
    component: Renderer,
    material: Material,
    primitive: Primitive,
    subPrimitive: SubMesh,
    texture?: Texture2D,
    subChunk?: SubPrimitiveChunk,
    shaderData?: ShaderData
  ): void {
    this._uiClip = null;
    this.component = component;
    this.material = material;
    this.primitive = primitive;
    this.subPrimitive = subPrimitive;
    this.shaderData = shaderData;
    this.texture = texture;
    this.subChunk = subChunk;
    this.instancedRenderers.length = 0;
    this.subDistancePriority = 0;
    this._isBatched = false;
  }

  /**
   * @internal
   * Copy identity fields from `source` and reset per-queue batch state, so the same
   * logical element can live in multiple queues (e.g. an Opaque + Transparent multi-pass
   * material) without one queue's batching corrupting another's `instancedRenderers`.
   */
  _cloneFrom(source: RenderElement): void {
    this.set(
      source.component,
      source.material,
      source.primitive,
      source.subPrimitive,
      source.texture,
      source.subChunk,
      source.shaderData
    );
    this._uiClip = source._uiClip;
    this.priority = source.priority;
    this.distanceForSort = source.distanceForSort;
    this.subShader = source.subShader;
    this.subDistancePriority = source.subDistancePriority;
  }

  dispose(): void {
    this._uiClip = null;
    this.component = null!;
    this.material = null!;
    this.primitive = null!;
    this.subPrimitive = null!;
    this.subShader = null!;
    this.shaderData && (this.shaderData = null!);
    this.instancedRenderers = null!;

    this.texture && (this.texture = null!);
    this.subChunk && (this.subChunk = null!);
  }
}
