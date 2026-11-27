import type { IShaderUniformBlock } from "@galacean/engine-design";
import type { Color, Vector4 } from "@galacean/engine-math";
import { getCalculatedMatrixRevision } from "../RenderPipeline/MatrixSnapshot";
import type { ShaderData } from "./ShaderData";
import { ShaderProperty } from "./ShaderProperty";
import { ShaderDataGroup } from "./enums/ShaderDataGroup";

/** A compact equality key for Auto blocks made of calculated transforms and material scalars/vectors. */
export class RendererUniformKey {
  readonly values: Float64Array;
  private readonly _matrices: ShaderProperty[] = [];
  private readonly _material: { property: ShaderProperty; components: number }[] = [];
  private _groupVersion = -1;
  private _uniqueOwners = false;

  static create(layout: IShaderUniformBlock): RendererUniformKey | undefined {
    if (layout.members.some((m) => m.arrayLength || !/^(mat4|float|vec[234])$/.test(m.type))) return;
    if (layout.members.some((m) => m.type === "mat4")) return new RendererUniformKey(layout);
  }

  private constructor(layout: IShaderUniformBlock) {
    let size = 0;
    for (const { name, type } of layout.members) {
      const property = ShaderProperty.getByName(name);
      if (type === "mat4") {
        this._matrices.push(property);
        size++;
      } else {
        const components = type === "float" ? 1 : Number(type[3]);
        this._material.push({ property, components });
        size += components;
      }
    }
    this.values = new Float64Array(size);
  }

  read(renderer: ShaderData, material?: ShaderData): Float64Array | undefined {
    if (this._groupVersion !== ShaderProperty._groupConflictVersion) {
      this._groupVersion = ShaderProperty._groupConflictVersion;
      this._uniqueOwners =
        this._matrices.every((p) => p._groups === ShaderDataGroup.Renderer) &&
        this._material.every((f) => f.property._groups === ShaderDataGroup.Material);
    }
    if (!this._uniqueOwners) return;
    const values = this.values;
    const rendererValues = renderer._propertyValueMap;
    let index = 0;
    for (let i = 0; i < this._matrices.length; i++) {
      const revision = getCalculatedMatrixRevision(rendererValues[this._matrices[i]._uniqueId]);
      if (!revision) return;
      values[index++] = revision;
    }
    const materialValues = material?._propertyValueMap;
    for (let i = 0; i < this._material.length; i++) {
      const { property, components } = this._material[i];
      const value = materialValues?.[property._uniqueId];
      if (components === 1) {
        if (typeof value !== "number") return;
        values[index++] = value;
      } else {
        if (!value || typeof value !== "object") return;
        if ("x" in value) {
          const vector = value as Vector4;
          values[index++] = vector.x;
          values[index++] = vector.y;
          if (components >= 3) values[index++] = vector.z ?? 0;
          if (components === 4) values[index++] = vector.w ?? 0;
        } else if ("r" in value) {
          const color = value as Color;
          values[index++] = color.r;
          values[index++] = color.g;
          if (components >= 3) values[index++] = color.b;
          if (components === 4) values[index++] = color.a;
        } else {
          return;
        }
      }
    }
    return values;
  }
}
