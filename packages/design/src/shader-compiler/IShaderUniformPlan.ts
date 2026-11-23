import type { IShaderInstancingNames } from "./ShaderInstancing";

/** Identifies a compiler-owned declaration in the macro VM's Text or OwnedText stream. */
export interface IShaderUniformSite {
  instruction: number;
  kind: "uniform" | "structMember" | "constant" | "entry" | "explicitMatrix" | "precision";
  name: string;
  type: string;
  structName?: string;
}

/** A live site after macro expansion, inheritance and stage reachability selection. */
export interface IShaderUniformSelection {
  site: IShaderUniformSite;
  start: number;
  end: number;
  text: string;
}

/** A selected loose uniform or uniform struct leaf, in ShaderData property notation. */
export interface IShaderUniformVariable {
  name: string;
  type: string;
  /** 0 for a non-array, -1 for a numeric loose array whose length is evaluated by GLSL. */
  arrayLength: number;
}

/** Optional payload for assets compiled with numeric uniform packing. */
export interface IShaderUniformPlan {
  vertex: IShaderUniformSite[];
  fragment: IShaderUniformSite[];
  instancing: IShaderInstancingNames;
}
