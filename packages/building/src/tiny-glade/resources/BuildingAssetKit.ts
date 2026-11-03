import { validateConstructionWindowCuts } from "../runtime/ConstructionWindowCutAsset";
import {
  Component,
  Loader,
  BufferMesh,
  MeshRenderer,
  Material,
  ReferResource,
  Texture2D,
  Texture2DArray,
  TextureCube
} from "@galacean/engine-core";
import { assemblyEmissionOrigin, assemblyRole, validateAssemblyPart, type BuildingAssembly } from "./BuildingAssembly";
import { PrefabResource } from "@galacean/engine-loader";
import type { ConstructionResourceRole } from "../runtime/ConstructionBindings";
import type { ConstructionGeometryAssets } from "./BuildingGeometry";
import { buildingGeometry, validateBuildingMesh } from "./BuildingGeometry";
import type { ConstructionDecorationCollisions } from "../runtime/ConstructionDecorationCollisions";
import type { ConstructionWindowCutAsset } from "../runtime/ConstructionWindowCutAsset";

export interface BuildingUnitBinding {
  kind: "storage" | "uniform";
  role: ConstructionResourceRole;
  minByteLength?: number;
}
export type BuildingTexture = Texture2D | Texture2DArray;
/** Placement/shader capabilities only. Geometry, material and texture data
 * are owned by the native MeshRenderer; fixed composition belongs to the Prefab. */
export class BuildingUnitComponent extends Component {
  family = "";
  instanceStride = 0;
  directInstances = false;
  bindings: Record<string, BuildingUnitBinding> = {};
  attributeLocations: Record<string, string> = {};
  integerAttributes: string[] = [];
  textureSlots: Record<string, string> = {};
  doubleSided = false;
  /** Surface interpretation for the decoration shader, independent of attachment. */
  surfaceKind = 0;
  /** Procedural attachment independent of the Entity name; fixed composition stays in the hierarchy. */
  attachment = "body";
  private _stoneFrame: PrefabResource | null = null;
  get stoneFrame() {
    return this._stoneFrame;
  }
  set stoneFrame(value: PrefabResource | null) {
    if (value !== null && (!(value instanceof PrefabResource) || value.destroyed))
      throw Error("Stone alternative requires a live Prefab");
    retainBuildingResource(value, 1);
    retainBuildingResource(this._stoneFrame, -1);
    this._stoneFrame = value;
  }
  emissionOrigin: number[] | undefined;
  private _sdfMaterial: Material | null = null;
  get sdfMaterial() {
    return this._sdfMaterial;
  }
  set sdfMaterial(value: Material | null) {
    retainBuildingResource(value, 1);
    retainBuildingResource(this._sdfMaterial, -1);
    this._sdfMaterial = value;
  }
  private _lodMesh: BufferMesh | null = null;
  get lodMesh() {
    return this._lodMesh;
  }
  set lodMesh(value: BufferMesh | null) {
    if (value !== null && (!(value instanceof BufferMesh) || value.destroyed))
      throw Error("LOD requires a live native BufferMesh");
    retainBuildingResource(value, 1);
    retainBuildingResource(this._lodMesh, -1);
    this._lodMesh = value;
  }
  protected override _onDestroy(): void {
    retainBuildingResource(this._stoneFrame, -1);
    this._stoneFrame = null;
    retainBuildingResource(this._lodMesh, -1);
    this._lodMesh = null;
    retainBuildingResource(this._sdfMaterial, -1);
    this._sdfMaterial = null;
    super._onDestroy();
  }
}
/** Fixed composition lives in this Entity's native child hierarchy. */
export class BuildingAssemblyComponent extends Component {}
export interface GothicUnit {
  mesh: BufferMesh;
  frameTemplate: string;
  glassTemplate: string;
  glassAlbedoSlot: number;
}
/** Native prefab collection. References select replaceable units, not copies of their bytes. */
export class BuildingAssetKitComponent extends Component {
  private _decorationMaterial: Material | null = null;
  get decorationMaterial() {
    return this._decorationMaterial;
  }
  set decorationMaterial(value: Material | null) {
    this.replace(this._decorationMaterial, value);
    this._decorationMaterial = value;
  }
  private _woodArchMaterial: Material | null = null;
  get woodArchMaterial() {
    return this._woodArchMaterial;
  }
  set woodArchMaterial(value: Material | null) {
    this.replace(this._woodArchMaterial, value);
    this._woodArchMaterial = value;
  }
  private _units: Record<string, PrefabResource> = {};
  private _decorations: Record<string, PrefabResource> = {};
  private _assemblies: Record<string, PrefabResource> = {};
  private _textures: Record<string, BuildingTexture> = {};
  private _neutralTextures: Record<string, BuildingTexture> = {};
  private _gothic: Record<string, GothicUnit> = {};
  private _roofSpireMesh: BufferMesh | null = null;
  private _sdfMaterials: Record<string, Material> = {};
  // Return structural copies: the native reflection loader patches object-valued
  // getters before invoking the setter. Never expose an owned reference table.
  get units() {
    return { ...this._units };
  }
  set units(value: Record<string, PrefabResource>) {
    const next = { ...value };
    this.replace(this._units, next);
    this._units = next;
  }
  get decorations() {
    return { ...this._decorations };
  }
  set decorations(value: Record<string, PrefabResource>) {
    const next = { ...value };
    this.replace(this._decorations, next);
    this._decorations = next;
  }
  get assemblies() {
    return { ...this._assemblies };
  }
  set assemblies(value: Record<string, PrefabResource>) {
    const next = { ...value };
    this.replace(this._assemblies, next);
    this._assemblies = next;
  }
  get textures() {
    return { ...this._textures };
  }
  set textures(value: Record<string, BuildingTexture>) {
    const next = { ...value };
    this.replace(this._textures, next);
    this._textures = next;
  }
  get neutralTextures() {
    return { ...this._neutralTextures };
  }
  set neutralTextures(value: Record<string, BuildingTexture>) {
    const next = { ...value };
    this.replace(this._neutralTextures, next);
    this._neutralTextures = next;
  }
  get gothic() {
    return copyGothicUnits(this._gothic);
  }
  set gothic(value: Record<string, GothicUnit>) {
    const next = copyGothicUnits(value);
    this.replace(this._gothic, next);
    this._gothic = next;
  }
  get roofSpireMesh() {
    return this._roofSpireMesh;
  }
  set roofSpireMesh(value: BufferMesh | null) {
    this.replace(this._roofSpireMesh, value);
    this._roofSpireMesh = value;
  }
  get sdfMaterials() {
    return { ...this._sdfMaterials };
  }
  set sdfMaterials(value: Record<string, Material>) {
    const next = { ...value };
    this.replace(this._sdfMaterials, next);
    this._sdfMaterials = next;
  }
  textureColors: Record<string, number[]> = {};
  decorationCollisions: ConstructionDecorationCollisions = {};
  windowCuts!: ConstructionWindowCutAsset;
  roofSpireColor: number[] = [];
  frameWords: number[] = [];
  sdfProxyIndices: number[] = [];
  private replace(previous: unknown, next: unknown) {
    visitResources(next, 1);
    visitResources(previous, -1);
  }
  _onClone(target: BuildingAssetKitComponent): void {
    // ComponentCloner owns direct resource fields. Nested collection entries
    // belong to this component and need matching ownership on the clone.
    for (const value of [
      target._units,
      target._decorations,
      target._assemblies,
      target._textures,
      target._neutralTextures,
      target._gothic,
      target._sdfMaterials
    ])
      visitResources(value, 1);
  }
  protected override _onDestroy(): void {
    for (const value of [
      this._decorationMaterial,
      this._woodArchMaterial,
      this._units,
      this._decorations,
      this._assemblies,
      this._textures,
      this._neutralTextures,
      this._gothic,
      this._roofSpireMesh,
      this._sdfMaterials
    ])
      visitResources(value, -1);
    super._onDestroy();
  }
}
function copyGothicUnits(value: Record<string, GothicUnit>): Record<string, GothicUnit> {
  return Object.fromEntries(Object.entries(value).map(([key, unit]) => [key, { ...unit }]));
}
function visitResources(value: unknown, delta: number): void {
  if (value instanceof ReferResource) retainBuildingResource(value, delta);
  else if (value && typeof value === "object") Object.values(value).forEach((child) => visitResources(child, delta));
}
export function retainBuildingResource(resource: ReferResource | null, delta: number): void {
  if (resource && !resource.destroyed)
    (resource as unknown as { _addReferCount(delta: number): void })._addReferCount(delta);
}
export function registerBuildingAssetComponents(): void {
  Loader.registerClass("BuildingUnitComponent", BuildingUnitComponent);
  Loader.registerClass("BuildingAssetKitComponent", BuildingAssetKitComponent);
  Loader.registerClass("BuildingAssemblyComponent", BuildingAssemblyComponent);
}
export interface NativeBuildingUnit {
  mesh: BufferMesh;
  material: Material | null;
  lodMesh: BufferMesh | null;
  sdfMaterial: Material | null;
  family: string;
  instanceStride: number;
  directInstances: boolean;
  bindings: Record<string, BuildingUnitBinding>;
  attributeLocations: Record<string, string>;
  integerAttributes: readonly string[];
  textureSlots: Record<string, string>;
  doubleSided: boolean;
  localMatrix?: number[];
}
export interface BuildingAssets {
  source: PrefabResource;
  woodArchMaterial: Material;
  decorationMaterial: Material;
  units: Record<string, NativeBuildingUnit>;
  decorations: Record<string, NativeBuildingUnit>;
  textures: Record<string, BuildingTexture>;
  neutralTextures: Record<string, BuildingTexture>;
  textureColors: Record<string, Float32Array>;
  frame: ArrayBuffer;
  sdfMaterials: Record<string, Material>;
  sdfProxyIndices: number[];
  compilation: ConstructionGeometryAssets;
}
const snapshots = new WeakMap<PrefabResource, BuildingAssets>();
/** Instantiates each distinct template once, detached from the Scene. Individual bricks
 * still produce only instance records. The source Prefab owns all borrowed resources. */
export function buildingAssets(source: PrefabResource): BuildingAssets {
  if (!(source instanceof PrefabResource) || source.destroyed) throw Error("Building requires a live asset-kit Prefab");
  const previous = snapshots.get(source);
  if (previous) return previous;
  const root = source.instantiate();
  try {
    const kit = root.getComponent(BuildingAssetKitComponent);
    if (!kit) throw Error("Building asset Prefab requires BuildingAssetKitComponent on its root");
    const extractEntity = (entity: import("@galacean/engine-core").Entity): NativeBuildingUnit => {
      const unit = entity.getComponent(BuildingUnitComponent),
        renderer = entity.getComponent(MeshRenderer);
      if (!unit || !(renderer?.mesh instanceof BufferMesh))
        throw Error("Building unit requires BuildingUnitComponent and native MeshRenderer/BufferMesh");
      if (!entity.isActive || !unit.enabled || !renderer.enabled)
        throw Error(`Building unit '${entity.name}' requires an active Entity and enabled components`);
      validateBuildingMesh(renderer.mesh);
      if (unit.lodMesh) validateBuildingMesh(unit.lodMesh);
      return {
        mesh: renderer.mesh,
        material: renderer.getMaterial(),
        lodMesh: unit.lodMesh,
        sdfMaterial: unit.sdfMaterial,
        family: unit.family,
        instanceStride: unit.instanceStride,
        directInstances: unit.directInstances,
        bindings: structuredClone(unit.bindings),
        attributeLocations: { ...unit.attributeLocations },
        integerAttributes: [...unit.integerAttributes],
        textureSlots: { ...unit.textureSlots },
        doubleSided: unit.doubleSided
      };
    };
    const extract = (prefab: PrefabResource): NativeBuildingUnit => {
      if (!(prefab instanceof PrefabResource) || prefab.destroyed) throw Error("Building unit requires a live Prefab");
      const entity = prefab.instantiate();
      try {
        // Arrangement shaders consume Mesh-local vertices, not an instantiated root pose.
        // Unsupported authored state must surface at Apply, never disappear during extraction.
        if (
          entity.children.length ||
          Array.from(entity.transform.localMatrix.elements).some((v, i) => v !== (i % 5 === 0 ? 1 : 0))
        )
          throw Error(`Building unit '${entity.name}' requires an identity root and no child nodes`);
        return extractEntity(entity);
      } finally {
        entity.destroy();
      }
    };
    const units = Object.fromEntries(Object.entries(kit.units).map(([name, prefab]) => [name, extract(prefab)]));
    const decorations = Object.fromEntries(
      Object.entries(kit.decorations).map(([name, prefab]) => [name, extract(prefab)])
    );
    const unitNames = new Map(Object.entries(kit.units).map(([name, prefab]) => [prefab, name]));
    const assemblies: Record<string, BuildingAssembly> = {};
    for (const [key, prefab] of Object.entries(kit.assemblies)) {
      const entity = prefab.instantiate();
      try {
        if (!entity.getComponent(BuildingAssemblyComponent)) throw Error("Assembly requires BuildingAssemblyComponent");
        const selected: BuildingAssembly["selected"] = [];
        const paths = new Set<string>();
        const visit = (node: typeof entity, path: string) => {
          if (!node.isActive || Math.min(node.transform.scale.x, node.transform.scale.y, node.transform.scale.z) <= 0)
            throw Error("Assembly requires active authored nodes and positive scale");
          const metadata = node.getComponent(BuildingUnitComponent);
          if (node.getComponent(MeshRenderer) || metadata) {
            if (!metadata?.enabled || metadata.family !== "decoration" || !node.getComponent(MeshRenderer)?.enabled)
              throw Error("Assembly part requires an enabled decoration unit and MeshRenderer");
            const name = `${key}/${path}`,
              matrix = Array.from(node.transform.worldMatrix.elements);
            validateAssemblyPart(name, matrix, metadata?.surfaceKind);
            if (decorations[name]) throw Error("Duplicate assembly part: " + name);
            decorations[name] = { ...extractEntity(node), localMatrix: matrix };
            const role = assemblyRole(metadata.attachment);
            const stoneTemplate = metadata.stoneFrame
              ? (unitNames.get(metadata.stoneFrame) ?? `stone-frame/${name}`)
              : undefined;
            if (stoneTemplate) {
              if (role !== "frame") throw Error("Stone alternative requires frame attachment");
              const unit = units[stoneTemplate] ?? extract(metadata.stoneFrame!);
              if (unit.family !== "stone-decoration") throw Error("Stone alternative requires a stone-decoration unit");
              units[stoneTemplate] = unit;
              unitNames.set(metadata.stoneFrame!, stoneTemplate);
            }
            selected.push([
              name,
              path,
              metadata.surfaceKind,
              assemblyEmissionOrigin(metadata.emissionOrigin, matrix),
              { role, ...(stoneTemplate ? { stoneTemplate, localMatrix: matrix } : {}) }
            ]);
          }
          for (const child of node.children) {
            const childPath = path ? `${path}/${child.name}` : child.name;
            if (!child.name || child.name.includes("/") || paths.has(childPath))
              throw Error("Invalid assembly child path");
            paths.add(childPath);
            visit(child, childPath);
          }
        };
        visit(entity, "");
        if (!selected.length) throw Error("Empty building assembly: " + key);
        assemblies[key] = { selected };
      } finally {
        entity.destroy();
      }
    }
    for (const [name, unit] of Object.entries(units)) {
      if (!unit.material || ![48, 64, 80, 96, 128].includes(unit.instanceStride))
        throw Error("Invalid arrangement unit: " + name);
    }
    if (!kit.decorationMaterial) throw Error("Building kit requires its decoration Material");
    if (!kit.woodArchMaterial) throw Error("Building kit requires its wood arch Material");
    const cutTexture = kit.textures[kit.windowCuts?.texture];
    if (!(cutTexture instanceof Texture2DArray)) throw Error("Window-cut atlas requires a native Texture2DArray");
    validateConstructionWindowCuts(kit.windowCuts, {
      [kit.windowCuts.texture]: { width: cutTexture.width, height: cutTexture.height, layers: cutTexture.length }
    });
    const result: BuildingAssets = {
      source,
      decorationMaterial: kit.decorationMaterial,
      woodArchMaterial: kit.woodArchMaterial,
      units,
      decorations,
      textures: { ...kit.textures },
      neutralTextures: { ...kit.neutralTextures },
      textureColors: Object.fromEntries(
        Object.entries(kit.textureColors).map(([name, colors]) => [name, Float32Array.from(colors)])
      ),
      frame: Uint32Array.from(kit.frameWords).buffer,
      sdfMaterials: { ...kit.sdfMaterials },
      sdfProxyIndices: [...kit.sdfProxyIndices],
      compilation: freezeGeometry(buildingGeometry(kit, units, decorations, assemblies))
    };
    snapshots.set(source, result);
    return result;
  } finally {
    root.destroy();
  }
}

/** The batching compiler specializes the unit's native shader for placement/picking.
 * Material properties remain authoritative and are cloned into each derived draw. */
export function materialProgram(material: Material) {
  const pass = material.shader.subShaders[0]?.passes[0] as unknown as {
    _vertexShaderInstructions: unknown[][];
    _fragmentShaderInstructions: unknown[][];
  };
  const source = (instructions: unknown[][]) => {
    if (!instructions || instructions.some((i) => i[0] !== 0))
      throw Error("Building unit shader requires an explicit placement program");
    return instructions.map((i) => String(i[1])).join("\n");
  };
  return {
    vert: { source: source(pass._vertexShaderInstructions) },
    frag: { source: source(pass._fragmentShaderInstructions) }
  };
}

function freezeGeometry<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeGeometry);
    Object.freeze(value);
  }
  return value;
}
