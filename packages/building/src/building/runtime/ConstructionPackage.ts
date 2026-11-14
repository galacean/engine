import { Texture2DArray } from "@galacean/engine-core";
import type { ResidentPackage, ResidentDraw, ResidentResource } from "./EngineResidentScene";
import type { ConstructionAssetLoader, ConstructionResourceRole } from "./ConstructionBindings";
import { type BuildingAssets, materialProgram } from "../resources/BuildingAssetKit";
import { validateGravityStep } from "./RoofGravityKernel.js";
export type ConstructionBindings = Partial<
  Record<Exclude<ConstructionResourceRole, "instances" | "indirection">, Uint8Array>
>;
export interface ConstructionDrawInput {
  id: string;
  ownerId?: string;
  template: string;
  instances: Uint8Array;
  /** Resize an original template once, before GPU upload. Positions use location
   * 0 and normals 2; instance/world transforms remain owned by the producer. */
  geometryScale?: readonly [number, number, number];
  wallRoofJoint?: ResidentDraw["wallRoofJoint"];
  bindings?: ConstructionBindings;
  variant?: string | null;
  group?: number | null;
  feedback?: NonNullable<NonNullable<ResidentDraw["instance_buffer"]>["feedback"]>;
}
/** Builds transient instance buffers around borrowed native prefab meshes/materials. */
export class ConstructionPackageBuilder {
  private readonly dynamic = new Map<string, Uint8Array>();
  private readonly ids = new Set<string>();
  private readonly draws: ResidentDraw[] = [];
  private sealed = false;
  constructor(
    private readonly assets: BuildingAssets,
    private readonly globals: ConstructionBindings = {}
  ) {}
  addDraw(input: ConstructionDrawInput): ResidentDraw {
    if (this.sealed) throw Error("Package already built");
    if (!input.id || this.ids.has(input.id)) throw Error("Duplicate/empty draw identity");
    const unit = this.assets.units[input.template];
    if (!unit) throw Error("Missing building unit Prefab: " + input.template);
    if (!(input.instances instanceof Uint8Array) || input.instances.byteLength % unit.instanceStride)
      throw Error("Whole instance records required");
    const count = input.instances.byteLength / unit.instanceStride;
    if (count > 0x7fffffff) throw Error("Instance count exceeds engine signed draw domain");
    if (input.feedback) {
      if (!unit.directInstances) throw Error("Feedback requires a direct-instance unit");
      for (const step of input.feedback.steps) validateGravityStep(step, count);
    }
    const scale = input.geometryScale;
    if (scale && (scale.length !== 3 || !scale.every((v) => v > 0 && Number.isFinite(Math.fround(v)))))
      throw Error("Positive finite template scale required");
    const root = "dynamic/" + encodeURIComponent(input.id) + "/";
    const bindings = { ...this.globals, ...input.bindings };
    const resources: Record<string, ResidentResource> = {};
    const pending = new Map<string, Uint8Array>();
    const instanceFile = root + "instances.bin";
    pending.set(instanceFile, input.instances);
    const indices = new Uint8Array(Uint32Array.from({ length: count }, (_, i) => i).buffer);
    for (const [name, binding] of Object.entries(unit.bindings)) {
      const { role } = binding;
      const bytes = role === "instances" ? input.instances : role === "indirection" ? indices : bindings[role];
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < (binding.minByteLength ?? 0) || bytes.byteLength % 4)
        throw Error(`Missing/invalid ${role} for ${input.id}/${name}`);
      const shared = role !== "instances" && role !== "indirection" && !Object.hasOwn(input.bindings ?? {}, role);
      const file = role === "instances" ? instanceFile : (shared ? "globals/" : root) + role;
      pending.set(file, bytes);
      resources[name] = { kind: binding.kind, file };
    }
    for (const [sampler, name] of Object.entries(unit.textureSlots))
      resources[sampler] = {
        kind: "texture",
        texture: name,
        array: this.assets.textures[name] instanceof Texture2DArray
      };
    for (const [name, bytes] of pending) if (!this.dynamic.has(name)) this.dynamic.set(name, bytes.slice());
    const draw: ResidentDraw = {
      id: input.id,
      ownerId: input.ownerId,
      family: unit.family,
      program: input.template,
      nativeUnit: unit,
      geometryScale: scale ? ([...scale] as [number, number, number]) : undefined,
      count,
      indexCount: unit.mesh.subMeshes.reduce((sum, s) => sum + s.count, 0),
      indices: "",
      attributes: [],
      ...(unit.lodMesh
        ? {
            lod: {
              attributes: [],
              indices: "",
              indexCount: unit.lodMesh.subMeshes.reduce((sum, s) => sum + s.count, 0)
            }
          }
        : {}),
      resources,
      indirection: Object.entries(unit.bindings).find(([, r]) => r.role === "indirection")?.[0],
      variant: input.variant ?? null,
      group: input.group ?? null,
      wallRoofJoint: input.wallRoofJoint,
      instance_buffer: unit.directInstances
        ? { file: instanceFile, stride: 64, ...(input.feedback ? { feedback: structuredClone(input.feedback) } : {}) }
        : null
    };
    this.ids.add(input.id);
    this.draws.push(draw);
    return draw;
  }
  build(): { package: ResidentPackage; asset: ConstructionAssetLoader; dynamicFiles: readonly string[] } {
    this.sealed = true;
    return {
      package: {
        nativeAssets: this.assets,
        programs: {
          ...Object.fromEntries(
            Object.entries(this.assets.units).map(([name, unit]) => [name, materialProgram(unit.material!)])
          ),
          "wooden-arch-frame": materialProgram(this.assets.woodArchMaterial)
        },
        brickSdf: {
          programs: Object.fromEntries(
            Object.entries(this.assets.units)
              .filter(([, unit]) => unit.sdfMaterial)
              .map(([name, unit]) => [name, materialProgram(unit.sdfMaterial!)])
          ),
          proxyIndices: this.assets.sdfProxyIndices
        },
        textures: Object.fromEntries(
          Object.entries(this.assets.textures).map(([name, texture]) => [
            name,
            { texture, neutral: this.assets.neutralTextures[name], colors: this.assets.textureColors[name] }
          ])
        ),
        draws: this.draws.slice()
      },
      dynamicFiles: [...this.dynamic.keys()],
      asset: async (name) => {
        const bytes = this.dynamic.get(name);
        if (!bytes) throw Error("Unknown generated building buffer: " + name);
        return bytes.slice().buffer;
      }
    };
  }
}
