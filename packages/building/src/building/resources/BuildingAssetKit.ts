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
import {
  assemblyEmissionOrigin,
  assemblyRole,
  validateAssemblyPart,
  type BuildingAssembly,
  type BuildingPrefab
} from "./BuildingAssembly";
import { PrefabResource } from "@galacean/engine-loader";
import type { ConstructionResourceRole } from "../runtime/ConstructionBindings";
import type { ConstructionGeometryAssets } from "./BuildingGeometry";
import { buildingGeometry, validateBuildingMesh } from "./BuildingGeometry";
import type { ConstructionDecorationCollisions } from "../runtime/ConstructionDecorationCollisions";

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
/** Root of a building prefab: a fixed composition of models placed as one unit, such as a
 * window, a door, a wall lamp or a roof hatch. Its members are the native child hierarchy;
 * their poses are part of the asset. The space they occupy decides what a prefab opens. A
 * window that spans a wall corner has its origin on that corner. */
export class BuildingPrefabComponent extends Component {
  /** How far in front of the wall the arch of an eave dormer starts, on a straight and on a
   * curved wall, in metres. */
  eaveOut = 0;
  eaveOutCurved = 0;
  /** The height of the stone threshold laid under a door that stands on the ground, in metres.
   * Default: 0, no threshold. */
  threshold = 0;
  /** Paths of the members that set the prefab's size. Default: all of them. */
  sizeMembers: string[] = [];
  private _roofProfile: [number, number][] = [];
  /** The outline of the small roof a prefab carries out of a roof slope, such as a dormer's:
   * its right half from the peak down to the eave, in the prefab's x/y plane. The roof is
   * the outline mirrored across x = 0. Empty when the prefab carries no roof. */
  get roofProfile() {
    return this._roofProfile.map((p) => [p[0], p[1]] as [number, number]);
  }
  set roofProfile(value: [number, number][]) {
    this._roofProfile = (value ?? []).map((p) => [p[0], p[1]]);
  }
}
/** A prefab member drawn with an arrangement unit, such as a stone hat. With a span it bends
 * along the surface the prefab is mounted on, from x = span[0] to x = span[1] of the
 * prefab; without one it is placed rigidly. */
export class BuildingUnitMemberComponent extends Component {
  private _unit: PrefabResource | null = null;
  private _onTimber: PrefabResource | null = null;
  span: [number, number] | null = null;
  get unit() {
    return this._unit;
  }
  set unit(value: PrefabResource | null) {
    retainBuildingResource(value, 1);
    retainBuildingResource(this._unit, -1);
    this._unit = value;
  }
  /** The unit drawn on a timber wall. Default: `unit`. */
  get onTimber() {
    return this._onTimber;
  }
  set onTimber(value: PrefabResource | null) {
    retainBuildingResource(value, 1);
    retainBuildingResource(this._onTimber, -1);
    this._onTimber = value;
  }
  protected override _onDestroy(): void {
    retainBuildingResource(this._unit, -1);
    retainBuildingResource(this._onTimber, -1);
    this._unit = null;
    this._onTimber = null;
    super._onDestroy();
  }
}
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
  private _prefabs: Record<string, PrefabResource> = {};
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
  get prefabs() {
    return { ...this._prefabs };
  }
  set prefabs(value: Record<string, PrefabResource>) {
    const next = { ...value };
    this.replace(this._prefabs, next);
    this._prefabs = next;
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
      target._prefabs,
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
      this._prefabs,
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
  Loader.registerClass("BuildingPrefabComponent", BuildingPrefabComponent);
  Loader.registerClass("BuildingUnitMemberComponent", BuildingUnitMemberComponent);
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
    // A building prefab's members keep their authored poses: each one's world matrix in the
    // prefab is baked into its mesh, so the prefab places as a single unit.
    const prefabs: Record<string, BuildingPrefab> = {};
    for (const [key, prefab] of Object.entries(kit.prefabs)) {
      const entity = prefab.instantiate();
      try {
        const root = entity.getComponent(BuildingPrefabComponent);
        if (!root) throw Error(`Building prefab "${key}" requires BuildingPrefabComponent on its root`);
        const members: BuildingPrefab["members"] = [],
          unitMembers: BuildingPrefab["units"] = [];
        const paths = new Set<string>();
        const visit = (node: typeof entity, path: string) => {
          if (!node.isActive || Math.min(node.transform.scale.x, node.transform.scale.y, node.transform.scale.z) <= 0)
            throw Error(`Building prefab "${key}" requires active nodes and positive scale`);
          const metadata = node.getComponent(BuildingUnitComponent),
            unitMember = node.getComponent(BuildingUnitMemberComponent);
          if (unitMember) {
            const unit = unitMember.unit && unitNames.get(unitMember.unit);
            if (!unit || units[unit]?.family !== "stone-decoration")
              throw Error(`A unit member of building prefab "${key}" requires a stone-decoration unit of the kit`);
            const span = unitMember.span;
            if (span && !(span[1] > span[0]))
              throw Error(`A unit member of building prefab "${key}" has an empty span`);
            const onTimber = unitMember.onTimber ? unitNames.get(unitMember.onTimber) : undefined;
            if (unitMember.onTimber && (!onTimber || units[onTimber]?.family !== "stone-decoration"))
              throw Error(
                `A unit member of building prefab "${key}" requires a stone-decoration unit for timber walls`
              );
            unitMembers.push({
              unit,
              ...(onTimber && { onTimber }),
              path,
              matrix: Array.from(node.transform.worldMatrix.elements),
              ...(span && { span: [span[0], span[1]] as [number, number] })
            });
          } else if (node.getComponent(MeshRenderer) || metadata) {
            if (!metadata?.enabled || metadata.family !== "decoration" || !node.getComponent(MeshRenderer)?.enabled)
              throw Error(`A member of building prefab "${key}" requires an enabled decoration unit and MeshRenderer`);
            const name = `prefab/${key}/${path}`,
              matrix = Array.from(node.transform.worldMatrix.elements);
            validateAssemblyPart(name, matrix, metadata.surfaceKind);
            if (decorations[name]) throw Error("Duplicate building prefab member: " + name);
            decorations[name] = { ...extractEntity(node), localMatrix: matrix };
            let stoneFrame: { template: string; matrix: number[] } | undefined;
            if (metadata.stoneFrame) {
              const template = unitNames.get(metadata.stoneFrame) ?? `stone-frame/${name}`;
              const unit = units[template] ?? extract(metadata.stoneFrame);
              if (unit.family !== "stone-decoration")
                throw Error(`The stone frame of building prefab "${key}" requires a stone-decoration unit`);
              units[template] = unit;
              unitNames.set(metadata.stoneFrame, template);
              stoneFrame = { template, matrix };
            }
            const emission = assemblyEmissionOrigin(metadata.emissionOrigin, matrix);
            members.push(
              stoneFrame
                ? [name, path, metadata.surfaceKind, emission, stoneFrame]
                : [name, path, metadata.surfaceKind, emission]
            );
          }
          for (const child of node.children) {
            const childPath = path ? `${path}/${child.name}` : child.name;
            if (!child.name || child.name.includes("/") || paths.has(childPath))
              throw Error(`Invalid member path in building prefab "${key}"`);
            paths.add(childPath);
            visit(child, childPath);
          }
        };
        visit(entity, "");
        if (!members.length) throw Error(`Empty building prefab "${key}"`);
        const roofProfile = root.roofProfile;
        if (
          roofProfile.length &&
          (roofProfile.length < 2 ||
            roofProfile[0][0] !== 0 ||
            roofProfile.some((p, i) => i > 0 && !(p[0] >= roofProfile[i - 1][0] && p[1] <= roofProfile[i - 1][1])) ||
            !(roofProfile[0][1] > roofProfile[roofProfile.length - 1][1]))
        )
          throw Error(`Building prefab "${key}" needs a roof profile that runs from its peak at x = 0 down and out`);
        prefabs[key] = {
          members,
          units: unitMembers,
          ...(roofProfile.length && { roofProfile }),
          ...(root.eaveOut > 0 && { eaveOut: root.eaveOut, eaveOutCurved: root.eaveOutCurved }),
          ...(root.threshold > 0 && { threshold: root.threshold }),
          ...(root.sizeMembers.length && { sizeMembers: [...root.sizeMembers] })
        };
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
      compilation: freezeGeometry(buildingGeometry(kit, units, decorations, assemblies, prefabs))
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
