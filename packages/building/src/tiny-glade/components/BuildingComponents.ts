import type { publishConstructionOwners } from "../runtime/ConstructionContacts";
import { resolvePitchedRoofAttachment } from "../runtime/ConstructionPitchedRoofAttachment";
import { constructionTerrainAffects } from "../runtime/ConstructionTerrainUpdate";
import { ConstructionEntrance } from "../runtime/ConstructionEntrance";
import { ConstructionSurfaceQuery } from "../runtime/ConstructionSurfaceQuery";
import { createMasonryDistanceView } from "../runtime/MasonryDistanceView";
import {
  MasonryResidency,
  createMasonryResidencyMetrics,
  type MasonryResidencyEntry
} from "../runtime/MasonryResidency";
import { MasonryLodProbe } from "../runtime/MasonryLodPolicy";
import { MasonryLodTransition } from "../runtime/MasonryLodTransition";
import { validateConstructionTerrain } from "../runtime/ConstructionTerrain";
import { constructionDecorationLights } from "../runtime/ConstructionDecorationLightPolicy";
import { ConstructionCpuClient, type ConstructionCpuHandle } from "../runtime/ConstructionWorkerClient";
import { resolveDocument } from "../runtime/PlacementDocument.js";
import { inspectMasonrySurface } from "../runtime/MasonrySurfaceInspection";
import {
  defaultSurfacePlacement,
  surfacePlacementValue,
  surfaceRegionValues,
  type BuildingSurfaceRole,
  type BuildingSurfacePlacement,
  type BuildingSurfaceRegion
} from "./BuildingSurface";
import { buildingAssets, retainBuildingResource } from "../resources/BuildingAssetKit";
import { PrefabResource } from "@galacean/engine";
import {
  BoundingBox,
  MeshRenderer,
  Component,
  Loader,
  Script,
  type Camera,
  type Entity,
  type Scene,
  Matrix,
  Quaternion,
  Vector3
} from "@galacean/engine";
import { prepareMasonry } from "../runtime/ConstructionRuntime";
import type { MasonryDocument } from "../runtime/MasonryDocument";
import type { RuntimePickVisitor } from "@galacean/engine-modify/rendering/runtime-pick-source";
import { buildingDocument, buildingRigidBindings } from "./BuildingDocument";
import { buildingFrameMatrix, buildingGroupInput, groundedBuildingDocument } from "./BuildingGroup";
import type { ConstructionTerrainSource } from "../runtime/ConstructionTerrain";
import { constructionDecorationDefinition } from "../runtime/ConstructionDecorationCatalog";
import { isFlatRoofHeight } from "../runtime/RoofMode";
import {
  ConstructionDecorationLights,
  type ConstructionDecorationLight
} from "../runtime/ConstructionDecorationLights";

import type { ConstructionBuilding } from "../runtime/ConstructionSource";
import {
  buildingShape,
  defaultBuildingShape,
  CircularBuildingShape,
  RectangularBuildingShape,
  type BuildingShape
} from "./BuildingShape";
import { buildingConfigurationValue, decorationAppearanceValue, defaultBuildingRoof } from "./BuildingConfiguration";

const systems = new WeakMap<Scene, BuildingSystem>();

/** Only authored properties live on components. Compiled documents and meshes are disposable. */
export abstract class MainBuildingComponent extends Component {
  abstract readonly kind: "house" | "wall" | "fence";
  private _assets: PrefabResource | null = null;
  get assets() {
    return this._assets;
  }
  set assets(value: PrefabResource | null) {
    if (value !== null && (!(value instanceof PrefabResource) || value.destroyed))
      throw Error("Building requires a live building-kit Prefab");
    if (value === this._assets) return;
    retainBuildingResource(value, 1);
    retainBuildingResource(this._assets, -1);
    this._assets = value;
    this.changed();
  }
  protected override _onDestroy(): void {
    retainBuildingResource(this._assets, -1);
    this._assets = null;
    super._onDestroy();
  }
  private _seed = 17;
  private _wallMaterial: 0 | 1 = 0;
  private _wallColor = 0;
  private _woodColor = 0;
  get seed() {
    return this._seed;
  }
  set seed(value: number) {
    this._seed = buildingConfigurationValue("seed", value);
    this.changed();
  }
  get wallMaterial() {
    return this._wallMaterial;
  }
  set wallMaterial(value: 0 | 1) {
    this._wallMaterial = buildingConfigurationValue("material", value);
    this.changed();
  }
  get wallColor() {
    return this._wallColor;
  }
  set wallColor(value: number) {
    this._wallColor = buildingConfigurationValue("wall_color", value);
    this.changed();
  }
  get woodColor() {
    return this._woodColor;
  }
  set woodColor(value: number) {
    this._woodColor = buildingConfigurationValue("wood_color", value);
    this.changed();
  }
  protected _shape: BuildingShape = defaultBuildingShape("house");
  protected _height = 4;
  get shape(): BuildingShape {
    return structuredClone(this._shape);
  }
  set shape(value: BuildingShape) {
    this._shape = buildingShape(value, this.kind);
    this.changed();
  }
  get height() {
    return this._height;
  }
  set height(value: number) {
    this._height = positive(value);
    this.changed();
  }
  _onEnableInScene(): void {
    BuildingSystem.forScene(this.entity.scene!).add(this);
  }
  _onDisableInScene(): void {
    systems.get(this.entity.scene!)?.remove(this);
  }
  protected changed(): void {
    if (this.entity.scene) systems.get(this.entity.scene!)?.invalidate();
  }
}
export abstract class DecorationComponent extends Component {
  private _woodColor: number | null = null;
  private _frameMaterial: "wood" | "wall" | null = null;
  protected _lightIntensity: number | null = null;
  private _lightColor: number | null = null;
  /** Null inherits the host's wood palette. */
  get woodColor() {
    return this._woodColor;
  }
  set woodColor(value: number | null) {
    this._woodColor = decorationAppearanceValue("woodColor", value);
    this.changed();
  }
  /** Null uses the selected decoration type's native material. */
  get frameMaterial() {
    return this._frameMaterial;
  }
  set frameMaterial(value: "wood" | "wall" | null) {
    this._frameMaterial = decorationAppearanceValue("frameMaterial", value);
    this.changed();
  }
  /** Window emission and lamp emission use the same producer contract. Null restores its default. */
  get lightIntensity() {
    return this._lightIntensity;
  }
  set lightIntensity(value: number | null) {
    this._lightIntensity = decorationAppearanceValue("lightIntensity", value);
    this.changed();
  }
  get lightColor() {
    return this._lightColor;
  }
  set lightColor(value: number | null) {
    this._lightColor = decorationAppearanceValue("lightColor", value);
    this.changed();
  }

  _onEnableInScene(): void {
    BuildingSystem.forScene(this.entity.scene!).add(this);
  }
  _onDisableInScene(): void {
    systems.get(this.entity.scene!)?.remove(this);
  }
  protected changed(): void {
    if (this.entity.scene) systems.get(this.entity.scene!)?.invalidate();
  }
}
/** Optional authored placement modifier on the same Entity as its body. */
export class BuildingSurfaceComponent extends Component {
  private _role: BuildingSurfaceRole = "roof";
  private _placement = defaultSurfacePlacement();
  private _placementEnabled = true;
  private _regions: BuildingSurfaceRegion[] = [];
  get role() {
    return this._role;
  }
  set role(value: BuildingSurfaceRole) {
    if (!["roof", "wall", "foundation", "surface"].includes(value)) throw Error("Unknown building surface role");
    this._role = value;
    this.changed();
  }
  /** False omits optional wall/foundation units while retaining the base body.
   * Disabling/removing this component instead restores the body's default placement. */
  get placementEnabled() {
    return this._placementEnabled;
  }
  set placementEnabled(value: boolean) {
    if (typeof value !== "boolean") throw Error("placementEnabled must be boolean");
    this._placementEnabled = value;
    this.changed();
  }
  get placement(): BuildingSurfacePlacement {
    return structuredClone(this._placement);
  }
  set placement(value: BuildingSurfacePlacement) {
    this._placement = surfacePlacementValue(value);
    this.changed();
  }
  /** Inspect published material cells. An unloaded group is queried in a Worker without allocating GPU detail. */
  inspectPublished(polygon?: number[][]) {
    const system = systems.get(this.entity.scene!);
    if (!system) throw Error("Building surface has no published system");
    return system.inspectSurface(this, polygon);
  }
  get regions(): BuildingSurfaceRegion[] {
    return structuredClone(this._regions);
  }
  set regions(value: BuildingSurfaceRegion[]) {
    this._regions = surfaceRegionValues(value);
    this.changed();
  }
  _onEnableInScene(): void {
    BuildingSystem.forScene(this.entity.scene!).add(this);
  }
  _onDisableInScene(): void {
    systems.get(this.entity.scene!)?.remove(this);
  }
  private changed(): void {
    if (this.entity.scene) systems.get(this.entity.scene!)?.invalidate();
  }
}
function positive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw Error("Dimension must be finite and positive");
  return value;
}
export class HouseComponent extends MainBuildingComponent {
  readonly kind = "house";
  private _roof = defaultBuildingRoof();
  private _foundation: ConstructionBuilding["foundation"] | null = null;
  private _plaster: ConstructionBuilding["plaster"] | null = null;
  private _floors: ConstructionBuilding["floors"] | null = null;
  get roof() {
    return structuredClone(this._roof);
  }
  set roof(value: ConstructionBuilding["roof"]) {
    this._roof = buildingConfigurationValue("roof", value);
    this.changed();
  }
  get foundation() {
    return structuredClone(this._foundation);
  }
  set foundation(value: ConstructionBuilding["foundation"] | null) {
    this._foundation = value === null ? null : buildingConfigurationValue("foundation", value!);
    this.changed();
  }
  get plaster() {
    return structuredClone(this._plaster);
  }
  set plaster(value: ConstructionBuilding["plaster"] | null) {
    this._plaster = value === null ? null : buildingConfigurationValue("plaster", value!);
    this.changed();
  }
  get floors() {
    return structuredClone(this._floors);
  }
  set floors(value: ConstructionBuilding["floors"] | null) {
    this._floors = value === null ? null : buildingConfigurationValue("floors", value!);
    this.changed();
  }
}
export class WallComponent extends MainBuildingComponent {
  readonly kind = "wall";
  protected _shape: BuildingShape = defaultBuildingShape("wall");
  protected _height = 1.5;
}
export class FenceComponent extends MainBuildingComponent {
  readonly kind = "fence";
  protected _shape: BuildingShape = defaultBuildingShape("fence");
  protected _height = 1.2;
}
/** Common dimensions and appearance for the existing attachment producers. */
export abstract class SizedDecorationComponent extends DecorationComponent {
  abstract readonly host: "wall" | "roof";
  abstract readonly kind: "window" | "door" | "wall-lamp" | "opening" | "hatch" | "lantern";
  protected abstract _type: string;
  protected _width = 1.2;
  protected _height = 1.5;
  private _rank: 1 | 2 | 3 = 1;
  get width() {
    return this._width;
  }
  set width(value: number) {
    this._width = positive(value);
    this.changed();
  }
  get height() {
    return this._height;
  }
  set height(value: number) {
    this._height = positive(value);
    this.changed();
  }
  get type() {
    return this._type;
  }
  set type(value: string) {
    const type = constructionDecorationDefinition(value);
    if (
      !type?.implemented ||
      !type.hosts.includes(this.host) ||
      type.purpose !== (["wall-lamp", "lantern"].includes(this.kind) ? "light" : this.kind)
    )
      throw Error(`Unsupported ${this.kind} ${this.host} decoration '${value}'`);
    this._type = value;
    this.changed();
  }
  get rank() {
    return this._rank;
  }
  set rank(value: 1 | 2 | 3) {
    if (![1, 2, 3].includes(value)) throw Error("Decoration rank must be 1, 2 or 3");
    this._rank = value;
    this.changed();
  }
}
/** Wall-mounted attachment. Entity owns its mount position and scale. */
export abstract class WallDecorationComponent extends SizedDecorationComponent {
  readonly host = "wall";
  abstract readonly kind: "window" | "door" | "wall-lamp" | "opening";
  private _seed = 0;
  /** Procedural variation. Changing Entity/Component identity does not change it. */
  get seed() {
    return this._seed;
  }
  set seed(value: number) {
    this._seed = buildingConfigurationValue("seed", value);
    this.changed();
  }
}
/** Roof charts and cuts are owned by the original producer. The child Entity
 * has an identity local transform; uv and elevation are the sole mount state. */
export abstract class RoofDecorationComponent extends SizedDecorationComponent {
  readonly host = "roof";
  abstract readonly kind: "window" | "hatch" | "lantern";
  protected _uv = [0.5, 0.5];
  private _elevation = 0;
  get uv() {
    return [...this._uv];
  }
  set uv(value: number[]) {
    if (!Array.isArray(value) || value.length !== 2 || !value.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
      throw Error("Roof uv must contain two finite values in [0,1]");
    this._uv = [...value];
    this.changed();
  }
  /** Metres above the producer's roof surface. Zero preserves a cut through the deck. */
  get elevation() {
    return this._elevation;
  }
  set elevation(value: number) {
    if (!Number.isFinite(value) || value < 0) throw Error("Roof elevation must be finite and nonnegative");
    this._elevation = value;
    this.changed();
  }
}
export class RoofWindowComponent extends RoofDecorationComponent {
  readonly kind = "window";
  protected _type = "dormer-cottage";
  protected _uv = [0.02, 0.5];
}
export class RoofHatchComponent extends RoofDecorationComponent {
  readonly kind = "hatch";
  protected _type = "hatch-cottage";
  protected _width = 1.125;
  protected _height = 0.375;
}
export class RoofLampComponent extends RoofDecorationComponent {
  readonly kind = "lantern";
  protected _type = "roof-lantern";
  protected _width = 0.4;
  protected _height = 0.8;
  protected _lightIntensity: number | null = 1;
}
export class WindowComponent extends WallDecorationComponent {
  readonly kind = "window";
  protected _type = "window-cottage";
}
/** Ground-open arch. The host wall material chooses the existing stone/wood producer. */
export class OpeningComponent extends WallDecorationComponent {
  readonly kind = "opening";
  protected _type = "opening-arch";
  protected _width = 2.8;
  protected _height = 2.8;
}
export class DoorComponent extends WallDecorationComponent {
  readonly kind = "door";
  protected _type = "door-cottage";
  protected _height = 2;
}
export class WallLampComponent extends WallDecorationComponent {
  readonly kind = "wall-lamp";
  protected _type = "wall-lantern";
  protected _width = 0.4;
  protected _height = 0.8;
  protected _lightIntensity: number | null = 1;
}

type Member = MainBuildingComponent | DecorationComponent | BuildingSurfaceComponent;
type Candidate = Awaited<ReturnType<typeof prepareMasonry>>;
type BoundLight = { descriptor: ConstructionDecorationLight; id: string; local: Vector3 };
type Input = {
  assets: PrefabResource;
  document: MasonryDocument;
  poses: ReadonlyMap<string, readonly number[]>;
  bodies: MainBuildingComponent[];
  bodyIds: Map<MainBuildingComponent, string>;
  terrain: ConstructionTerrainSource;
  worldFrame?: Matrix;
  signature: string;
};
type View = MasonryResidencyEntry & {
  frame: Entity;
  view: Awaited<ReturnType<typeof createMasonryDistanceView>>;
  signature: string;
  lights: BoundLight[];
  bodies: MainBuildingComponent[];
  bodyIds: Map<MainBuildingComponent, string>;
  worldMatrix: Float64Array;
  retryAt?: number;
  structure: ConstructionSurfaceQuery;
  worldStructure?: ConstructionSurfaceQuery;
  structureMatrix: Float64Array;
  cpu: ConstructionCpuHandle;
  roofs: Map<string, ReturnType<typeof publishConstructionOwners>[number]["roof"]>;
  inspection?: { controller: AbortController; result: Promise<ReturnType<typeof resolveDocument>["cells"]> };
};
type Host = {
  camera: Camera;
  /** A stable Source Entity coordinate frame. Bodies sharing it compile together. */
  frame(body: MainBuildingComponent): Entity;
  /** Published immutable world terrain/rock snapshot. Omit only in a standalone local model scene. */
  terrain?: ConstructionTerrainSource;
  identity(component: Member): string;
  resolve(id: string): Component | undefined;
};
type Build = {
  frame: Entity;
  bodies: MainBuildingComponent[];
  signature: string;
  controller: AbortController;
  checkedRevision: number;
};

/** Shared by detached Source validation and live publication. Membership already
 * accounts for component enablement and Entity activation in each caller. */
export function validateBuildingMembers(members: Iterable<Component>): void {
  for (const member of members) {
    if (member instanceof DecorationComponent && !member.entity.parent?.getComponent(HouseComponent))
      throw Error("A building decoration must be a direct child of a HouseComponent Entity");
    if (
      member instanceof BuildingSurfaceComponent &&
      member.entity.getComponents(Component, []).filter((component) => component instanceof MainBuildingComponent)
        .length !== 1
    )
      throw Error("A building surface must share an Entity with exactly one building body");
  }
}

/** Scene membership and derived render work only; no editable object-record copy. */
export class BuildingSystem extends Script {
  private readonly compiler = new ConstructionCpuClient();
  private readonly members = new Map<Member, ReturnType<Entity["transform"]["registerWorldChangeFlag"]>>();
  private readonly views = new Map<Entity, View>();
  private readonly entries: View[] = [];
  private readonly residencyMetrics = {
    ...createMasonryResidencyMetrics(),
    detailAttempts: 0,
    detailFailures: 0,
    budgetDeferred: 0
  };
  private residency?: MasonryResidency<View>;
  private host?: Host;
  private pending?: Promise<void>;
  private detailPending?: Promise<void>;
  private build?: Build;
  private detailBuild?: Build;
  private detailDirty = true;
  private retryAt = Infinity;
  private revision = 0;
  private surfaceRevision = 0;
  private shown = true;
  private applied = -1;
  private probeRevision = -1;
  private frameRevision = -1;
  private frameGroups = new Map<Entity, MainBuildingComponent[]>();
  private error?: unknown;
  private publishedTerrain?: ConstructionTerrainSource;
  private terrainUpdate?: { discard(): void };
  private inputUpdates = 0;
  private closed = false;
  private ownerScene?: Scene;
  private lights?: ConstructionDecorationLights;
  private readonly lightDescriptors: ConstructionDecorationLight[] = [];
  private readonly lightPosition = new Vector3();
  private readonly entrance = new ConstructionEntrance();
  private entranceEnabled = false;
  private entranceStarted = false;

  /** Presentation visibility is independent of the manager's Engine tick. */
  get visible(): boolean {
    return this.shown;
  }
  set visible(value: boolean) {
    if (value === this.shown) return;
    this.shown = value;
    this.surfaceRevision++;
    this.updateResidency(0);
    this.updateLights(0);
  }
  get publicationRevision(): number {
    this.surfaceQueries();
    return this.surfaceRevision;
  }

  /** After initial flush, hold published geometry at zero until the host's
   * world presentation barrier opens. Standalone scenes remain settled by default. */
  publishEntrance(): void {
    if (this.entranceEnabled) throw Error("Building entrance has already been published");
    this.entranceEnabled = true;
    this.entrance.publish();
    this.applyEntrance();
    this.updateLights(0);
  }
  startEntrance(): void {
    if (!this.entranceEnabled) throw Error("Building entrance has not been published");
    if (this.entranceStarted) return;
    this.entranceStarted = true;
    this.entrance.start();
  }
  /** Explicit preview only; geometry edits and residency never replay the clock. */
  replayEntrance(body?: MainBuildingComponent): void {
    if (body && !this.members.has(body)) throw Error("Building is not active");
    const owners = body ? new Set([this.host!.identity(body)]) : undefined;
    this.entrance.replay(owners);
    this.applyEntrance();
    this.updateLights(0);
  }
  private applyEntrance(changed?: ReadonlySet<string>): void {
    for (const view of this.entries) {
      if (changed && ![...view.bodyIds.values()].some((id) => changed.has(id))) continue;
      view.view.setEntrance(this.entrance.states);
      view.fine?.runtime.setEntrance(this.entrance.states);
    }
  }

  static forScene(scene: Scene): BuildingSystem {
    let system = systems.get(scene);
    if (!system) {
      system = scene.createRootEntity("Building runtime").addComponent(BuildingSystem);
      system.ownerScene = scene;
      systems.set(scene, system);
    }
    return system;
  }
  bind(host: Host): void {
    this.terrainUpdate?.discard();
    this.build?.controller.abort();
    this.detailBuild?.controller.abort();
    if (host.terrain) validateConstructionTerrain(host.terrain.grid);
    this.publishedTerrain = host.terrain;
    this.host = host;
    this.residency = new MasonryResidency(
      this.engine,
      host.camera,
      this.entries,
      this.residencyMetrics,
      () => {
        this.detailDirty = true;
      },
      () => {
        this.detailDirty = true;
      }
    );
    for (const view of this.views.values()) view.signature = "";
    this.invalidate();
  }
  add(component: Member): void {
    if (this.members.has(component)) return;
    this.members.set(component, component.entity.transform.registerWorldChangeFlag());
    this.invalidate();
  }
  remove(component: Member): void {
    this.members.get(component)?.destroy();
    this.members.delete(component);
    if (component instanceof MainBuildingComponent) {
      for (const build of [this.build, this.detailBuild])
        if (build?.bodies.includes(component)) build.controller.abort();
      for (const [frame, view] of this.views)
        if (view.bodies.includes(component)) {
          view.signature = "";
          for (const build of [this.build, this.detailBuild]) if (build?.frame === frame) build.controller.abort();
          const id = view.bodyIds.get(component)!;
          view.view.setOwnerVisible(id, false);
          view.structure = view.structure.withoutOwner(id);
          view.worldStructure = undefined;
          this.surfaceRevision++;
          for (const draw of view.fine?.runtime.draws.values() ?? [])
            if (draw.ownerId === id) {
              draw.enabled = false;
              draw.renderer.enabled = draw.lodRenderer.enabled = false;
            }
          if (view.bodies.every((body) => !this.members.has(body))) this.retire(view);
        }
    }
    this.invalidate();
  }
  /** Batch authored inputs without rebuilding against an intermediate environment. */
  async beginInputUpdate(): Promise<void> {
    this.inputUpdates++;
    this.build?.controller.abort();
    this.detailBuild?.controller.abort();
    // Previous input failures cannot veto applying their repair. The new input is validated at flush.
    await Promise.allSettled([this.pending, this.detailPending]);
  }
  endInputUpdate(): void {
    if (this.inputUpdates) this.inputUpdates--;
  }

  invalidate(): void {
    this.revision++;
  }
  private readTransforms(): void {
    // A restarted Worker no longer owns these snapshots, even if author inputs are unchanged.
    for (const view of this.views.values())
      if (view.signature && !view.cpu.valid) {
        view.signature = "";
        this.invalidate();
      }
    for (const [member, flag] of this.members)
      if (flag.flag) {
        member.entity.transform.worldMatrix;
        flag.flag = false;
        this.invalidate();
      }
  }
  onUpdate(deltaTime: number): void {
    this.readTransforms();
    this.validateBuild();
    if (this.error && performance.now() >= this.retryAt) {
      this.retryAt = Infinity;
      this.invalidate();
    }
    if (this.entrance.advance(deltaTime)) this.applyEntrance(this.entrance.changed);
    this.updateResidency(deltaTime);
    this.updateLights(deltaTime);
    if (this.host && !this.inputUpdates && !this.terrainUpdate && !this.pending && this.applied !== this.revision)
      void this.flush().catch(() => {});
  }
  /** Publish changed Scene inputs and finish currently eligible detail loads.
   * Distant groups remain editable and pickable through their distance view. */
  async flush(): Promise<void> {
    if (this.closed) throw Error("Building system is disposed");
    if (this.inputUpdates) throw new DOMException("Building inputs are being applied", "AbortError");
    if (this.terrainUpdate) throw Error("Building environment publication is pending");
    if (!this.host) throw Error("Building system has no Scene identity provider");
    do {
      this.readTransforms();
      this.validateBuild();
      while (this.applied !== this.revision && !this.closed) {
        if (!this.pending)
          this.pending = this.drain().finally(() => {
            this.pending = undefined;
          });
        await this.pending;
        if (this.inputUpdates) throw new DOMException("Building inputs are being applied", "AbortError");
      }
      if (this.closed) throw Error("Building system is disposed");
      if (this.error) throw this.error;
      this.updateResidency(0);
      await this.detailPending;
      this.readTransforms();
      this.validateBuild();
    } while (this.applied !== this.revision);
    this.updateResidency(0);
    const failure = this.entries.find((entry) => entry.error && this.residency!.desired.has(entry));
    if (failure) throw Error(failure.error);
    this.updateLights(0);
  }
  get terrainSource(): ConstructionTerrainSource | undefined {
    return this.publishedTerrain;
  }
  /** The actual compilation group owned by this Scene, also used for explicit
   * group placement. No independent group directory is maintained by editors. */
  groupEntity(body: MainBuildingComponent): Entity {
    if (!this.host || !this.members.has(body)) throw Error("Building body is not active in this Scene");
    return this.host.frame(body);
  }
  get terrainEditPending(): boolean {
    return !!this.terrainUpdate;
  }
  /** Stage all groups against one immutable environment. Scene objects stay live;
   * only derived meshes are hidden. Commit/rollback/finalize are synchronous so
   * the world can publish terrain, collision and buildings in one transaction. */
  async prepareTerrain(next: ConstructionTerrainSource, signal?: AbortSignal) {
    if (!next) throw Error("Published building terrain is unavailable");
    validateConstructionTerrain(next.grid);
    signal?.throwIfAborted();
    if (!this.inputUpdates) await this.flush();
    validateBuildingMembers(this.members.keys());
    signal?.throwIfAborted();
    if (this.terrainUpdate) throw Error("Building environment publication is pending");
    this.readTransforms();
    const revision = this.revision,
      host = this.host!;
    let previous = this.publishedTerrain;
    const before = [...this.entries],
      prepared: View[] = [];
    const beforeSignatures = new Map(before.map((view) => [view, view.signature]));
    const preparedSignatures = new Map<View, string>();
    let finished = false,
      committed = false;
    const check = () => {
      signal?.throwIfAborted();
      this.readTransforms();
      if (
        finished ||
        this.closed ||
        prepared.some((view) => !view.cpu.valid) ||
        this.host !== host ||
        this.revision !== revision ||
        this.publishedTerrain !== (committed ? next : previous)
      )
        throw Error("Building environment candidate is stale");
    };
    const install = (
      entries: View[],
      terrain: ConstructionTerrainSource | undefined,
      signatures: ReadonlyMap<View, string>
    ) => {
      for (const entry of this.entries) {
        entry.view.root.isActive = false;
        if (entry.fine) entry.fine.runtime.root.isActive = false;
      }
      this.views.clear();
      this.entries.length = 0;
      this.residency!.desired.clear();
      this.publishedTerrain = terrain;
      for (const entry of entries) {
        entry.signature = signatures.get(entry)!;
        this.views.set(entry.frame, entry);
        this.entries.push(entry);
        this.acceptEntrance(entry);
        this.refreshProbe(entry);
        entry.view.root.isActive = true;
      }
      this.residency!.selectionDirty = true;
      this.residency!.invalidate();
      if (prepared.some((view) => !beforeSignatures.has(view))) this.surfaceRevision++;
      this.probeRevision = -1;
      this.detailDirty = true;
      this.updateResidency(0);
      this.updateLights(0);
    };
    const destroy = (entries: View[]) => {
      for (const entry of entries) {
        entry.cpu.dispose();
        entry.inspection?.controller.abort();
        entry.fine?.destroy();
        entry.view.destroy();
      }
    };
    const finish = () => {
      finished = true;
      signal?.removeEventListener("abort", discard);
      if (this.terrainUpdate === token) this.terrainUpdate = undefined;
      // A settled transaction no longer owns the previous world or its views.
      previous = undefined;
      before.length = 0;
      beforeSignatures.clear();
      preparedSignatures.clear();
    };
    const rollback = () => {
      if (finished || !committed) return;
      install(before, previous, beforeSignatures);
      committed = false;
    };
    const discard = () => {
      if (finished) return;
      rollback();
      destroy(prepared.filter((view) => !beforeSignatures.has(view)));
      finish();
    };
    const token = (this.terrainUpdate = { discard });
    this.detailBuild?.controller.abort();
    signal?.addEventListener("abort", discard, { once: true });
    try {
      check();
      for (const frame of this.frames().keys()) {
        const input = this.input(frame, next),
          old = this.views.get(frame);
        const unchanged =
          old &&
          previous &&
          old.signature === this.input(frame, previous).signature &&
          !constructionTerrainAffects(input.document, previous.grid, next.grid);
        const view = unchanged
          ? old
          : await this.prepareView(frame, input, check, signal ?? new AbortController().signal);
        prepared.push(view);
        preparedSignatures.set(view, input.signature);
        check();
      }
      // Capture immutable spatial facts before accepting, for navigation and
      // other world consumers. Hidden render state never leaks into live queries.
      const queries = this.queriesFor(prepared);
      return {
        metrics: {
          buildingSupportCandidates: prepared.reduce((sum, view) => sum + view.bodies.length, 0),
          buildingSupportsUpdated: prepared
            .filter((view) => !beforeSignatures.has(view))
            .reduce((sum, view) => sum + view.bodies.length, 0),
          buildingsRetained: prepared
            .filter((view) => beforeSignatures.has(view))
            .reduce((sum, view) => sum + view.bodies.length, 0)
        },
        bounds: queries.flatMap((query) => query.bounds),
        captureSurfaceQuery: () => this.captureQueries(queries),
        assertCurrent: check,
        commit: () => {
          check();
          if (committed) throw Error("Building environment candidate is already committed");
          // Set first so even an unexpected mutate-then-throw setter can roll back.
          committed = true;
          try {
            install(prepared, next, preparedSignatures);
          } catch (error) {
            rollback();
            throw error;
          }
        },
        rollback,
        finalize: () => {
          if (finished) return;
          if (!committed) throw Error("Building environment must be committed before finalizing");
          destroy(before.filter((view) => !preparedSignatures.has(view)));
          finish();
        },
        discard
      };
    } catch (error) {
      discard();
      throw error;
    }
  }
  /** Derived mounted pose for inspection; the attachment Entity stores roof UV, not its rendered position. */
  roofWindowView(window: RoofWindowComponent): { position: Vector3; forward: Vector3 } | undefined {
    if (!this.host || !this.members.has(window)) return;
    const house = window.entity.parent?.getComponent(HouseComponent);
    if (!house || !this.members.has(house)) return;
    const frame = this.host.frame(house),
      input = this.input(frame);
    const view = this.views.get(frame);
    if (!view || view.signature !== input.signature) return;
    const roof = view.roofs.get(this.host!.identity(house));
    if (!roof) return;
    const result = resolvePitchedRoofAttachment(roof.surface, roof.footprint, window.uv, window.elevation);
    if (!result.ok) return;
    const pose = result.attachment.transform;
    const position = new Vector3(...pose.position),
      forward = new Vector3();
    Vector3.transformByQuat(new Vector3(0, 0, 1), new Quaternion(...pose.quaternion), forward);
    Vector3.transformCoordinate(position, frame.transform.worldMatrix, position);
    Vector3.transformNormal(forward, frame.transform.worldMatrix, forward);
    forward.normalize();
    return { position, forward };
  }
  private bodyInput(building: MainBuildingComponent) {
    const assets = building.assets;
    if (!assets || assets.destroyed) throw Error("Building requires its Scene VFS building-kit Prefab");
    const children = building.entity.children
      .flatMap((entity) => entity.getComponents(Component, []))
      .filter((component) => this.members.has(component as Member));
    const decorations = children.filter(
      (item): item is WallDecorationComponent => item instanceof WallDecorationComponent
    );
    const surfaces = building.entity
      .getComponents(BuildingSurfaceComponent, [])
      .filter((surface) => this.members.has(surface));
    const roofDecorations = children.filter(
      (item): item is RoofDecorationComponent => item instanceof RoofDecorationComponent
    );
    const ids = new Set<string>();
    for (const object of [building, ...decorations, ...surfaces, ...roofDecorations]) {
      const id = this.host!.identity(object);
      if (!id || ids.has(id)) throw Error("Building objects require distinct Scene component identities");
      ids.add(id);
    }
    const document: MasonryDocument = buildingDocument(
      building,
      decorations,
      (object) => this.host!.identity(object),
      surfaces,
      roofDecorations
    );
    const poses = buildingRigidBindings(
      building,
      decorations,
      (object) => this.host!.identity(object),
      roofDecorations
    );
    // Equal fitted dimensions can still have different local bind frames (width × scale).
    return { assets, document, poses };
  }
  private frames(): Map<Entity, MainBuildingComponent[]> {
    if (this.frameRevision === this.revision) return this.frameGroups;
    const frames = new Map<Entity, MainBuildingComponent[]>();
    for (const member of this.members.keys())
      if (member instanceof MainBuildingComponent) {
        const frame = this.host!.frame(member);
        if (frame.destroyed || frame.scene !== this.entity.scene)
          throw Error("Building frame must belong to the active Scene");
        const bodies = frames.get(frame) ?? [];
        bodies.push(member);
        frames.set(frame, bodies);
      }
    this.frameRevision = this.revision;
    this.frameGroups = frames;
    return frames;
  }
  private input(frame: Entity, publishedTerrain = this.publishedTerrain): Input {
    const bodies = this.frames().get(frame);
    if (!bodies?.length) throw Error("Building group no longer has active bodies");
    const inputs = bodies.map((body) => ({
      ...this.bodyInput(body),
      transform: buildingFrameMatrix(body.entity, frame)
    }));
    const assets = inputs[0].assets;
    if (inputs.some((input) => input.assets !== assets))
      throw Error("Connected building components must reference the same asset library");
    const grouped = buildingGroupInput(inputs),
      poses = grouped.poses;
    const worldFrame = publishedTerrain ? frame.transform.worldMatrix.clone() : undefined;
    const document = worldFrame ? groundedBuildingDocument(grouped.document, worldFrame) : grouped.document;
    const extent = Math.max(
      1,
      ...document.construction.buildings.map((body) => {
        const shape = body.rectangle ?? body.circle!,
          radius = body.circle?.radius ?? Math.hypot(...body.rectangle!.size) / 2;
        return Math.max(Math.abs(shape.center[0]), Math.abs(shape.center[1])) + radius + 4;
      })
    );
    const terrain = publishedTerrain ?? {
      revision: 0,
      grid: {
        samples: new Uint16Array(4),
        resolution: 2,
        origin: [-extent, -extent] as [number, number],
        size: 2 * extent,
        decode: { offset: 0, scale: 1 }
      }
    };
    const bodyIds = new Map(bodies.map((body) => [body, this.host!.identity(body)]));
    return {
      assets,
      document,
      poses,
      bodies,
      bodyIds,
      terrain,
      worldFrame,
      signature: JSON.stringify([assets.instanceId, document, [...poses], terrain?.revision])
    };
  }
  private validateBuild(force = false): void {
    for (const build of [this.build, this.detailBuild]) {
      if (!build || build.controller.signal.aborted || (!force && build.checkedRevision === this.revision)) continue;
      build.checkedRevision = this.revision;
      try {
        if (this.input(build.frame).signature === build.signature) continue;
      } catch {
        /* Report the invalid current input through the next publication. */
      }
      build.controller.abort();
      this.invalidate();
    }
  }
  private retire(view: View): void {
    this.residency?.desired.delete(view);
    this.views.delete(view.frame);
    const index = this.entries.indexOf(view);
    if (index >= 0) this.entries.splice(index, 1);
    view.cpu.dispose();
    view.inspection?.controller.abort();
    view.fine?.destroy();
    view.view.destroy();
    if (this.residency) {
      this.residency.selectionDirty = true;
      this.residency.invalidate();
    }
    this.detailDirty = true;
  }
  private refreshProbe(view: View): void {
    const matrix = view.view.root.transform.worldMatrix,
      elements = matrix.elements;
    if (view.worldMatrix.every((value, i) => value === elements[i])) return;
    view.worldMatrix.set(elements);
    const bounds = new BoundingBox(new Vector3(...view.view.bounds.min), new Vector3(...view.view.bounds.max));
    BoundingBox.transform(bounds, matrix, bounds);
    const scale = Math.max(...[0, 4, 8].map((i) => Math.hypot(elements[i], elements[i + 1], elements[i + 2])));
    view.probe = new MasonryLodProbe(
      { min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] },
      [0, 0, 0],
      0.3 * scale
    );
    this.residency!.selectionDirty = true;
  }
  private acceptEntrance(view: View): void {
    for (const [id, range] of view.view.entranceRanges) {
      if (this.entranceEnabled) this.entrance.accept(id, range.min, range.max, this.entranceStarted);
      else this.entrance.define(id, range.min, range.max);
    }
    view.view.setEntrance(this.entrance.states);
    view.fine?.runtime.setEntrance(this.entrance.states);
  }
  /** Allocates only derived, hidden geometry. No author state or live view changes. */
  private async prepareView(frame: Entity, input: Input, check: () => void, signal: AbortSignal): Promise<View> {
    const { assets, document, signature, poses, bodies, bodyIds, terrain } = input;
    let distance: View["view"] | undefined;
    let cpu: ConstructionCpuHandle | undefined;
    retainBuildingResource(assets, 1);
    try {
      buildingAssets(assets);
      check();
      const candidate = await this.compiler.prepare(document, terrain.grid, buildingAssets(assets).compilation, signal);
      cpu = candidate.cpu;
      const { preview: geometry, structure: structureData } = candidate;
      check();
      const structure = ConstructionSurfaceQuery.fromSnapshot(structureData!);
      distance = await createMasonryDistanceView(
        this.engine,
        frame,
        {
          document,
          resolvePickId: (owner, id) => (id && this.resolve(id) ? id : owner),
          rigidDecorations: { poses, resolve: (id) => this.resolve(id)?.entity }
        },
        terrain,
        assets,
        this.host!.camera,
        geometry,
        signal
      );
      distance.root.isActive = false;
      await distance.ready;
      check();
      if (!cpu.valid) throw Error("Building compilation snapshot expired during view preparation");
      if (this.closed) throw Error("Building system is disposed");
      const lights = constructionDecorationLights(geometry.decorationParts).map((light) => {
        const id = light.decorationId ?? light.ownerId,
          binding = poses.get(id);
        if (!binding) throw Error(`Missing light binding ${id}`);
        const inverse = new Matrix();
        inverse.copyFromArray(binding);
        const local = new Vector3(...light.position);
        Vector3.transformCoordinate(local, inverse, local);
        return { descriptor: { ...light, position: [...light.position] as [number, number, number] }, id, local };
      });
      return {
        frame,
        view: distance,
        signature,
        lights,
        bodies,
        bodyIds,
        structure,
        cpu,
        roofs: new Map(geometry.owners.map((owner) => [owner.building.id, owner.roof])),
        structureMatrix: new Float64Array(16).fill(NaN),
        lod: 2,
        transition: new MasonryLodTransition(),
        prefetch: false,
        probe: new MasonryLodProbe(distance.bounds, [0, 0, 0]),
        budgetLod: 2,
        lastUsed: performance.now(),
        priority: 0,
        visible: false,
        worldMatrix: new Float64Array(16).fill(NaN)
      };
    } catch (error) {
      // Only live edits retry failed GPU/texture loads automatically. Detached
      // environment failures belong to their caller's transaction.
      if (distance && !this.terrainUpdate) this.retryAt = performance.now() + 2000;
      cpu?.dispose();
      distance?.destroy();
      throw error;
    } finally {
      retainBuildingResource(assets, -1);
    }
  }

  private async drain(): Promise<void> {
    while (!this.closed && !this.inputUpdates && this.applied !== this.revision) {
      const revision = this.revision;
      let build: Build | undefined;
      this.error = undefined;
      this.retryAt = Infinity;
      try {
        validateBuildingMembers(this.members.keys());
        const frames = this.frames();
        for (const [frame, view] of this.views) if (!frames.has(frame)) this.retire(view);
        for (const frame of frames.keys()) {
          const input = this.input(frame),
            { signature, bodies } = input;
          const old = this.views.get(frame);
          if (old?.signature === signature) continue;
          build = this.build = {
            frame,
            bodies,
            signature,
            controller: new AbortController(),
            checkedRevision: this.revision
          };
          let candidate: View | undefined;
          try {
            candidate = await this.prepareView(
              frame,
              input,
              () => {
                this.readTransforms();
                this.validateBuild(true);
                build!.controller.signal.throwIfAborted();
              },
              build.controller.signal
            );
            this.acceptEntrance(candidate);
            if (!old || !old.structure.hasSameGeometry(candidate.structure)) this.surfaceRevision++;
            if (old) this.retire(old);
            this.views.set(frame, candidate);
            this.entries.push(candidate);
            this.refreshProbe(candidate);
            candidate.view.root.isActive = this.shown;
            candidate = undefined;
            this.residency!.selectionDirty = true;
            this.residency!.invalidate();
            this.detailDirty = true;
          } catch (error) {
            candidate?.view.destroy();
            throw error;
          }
          this.build = build = undefined;
        }
      } catch (error) {
        if (!build?.controller.signal.aborted) this.error = error;
      } finally {
        this.build = undefined;
      }
      if (!this.inputUpdates && revision === this.revision) {
        this.applied = revision;
        if (!this.error) {
          const activeIds = new Set(
            [...this.members.keys()]
              .filter((member) => member instanceof MainBuildingComponent)
              .map((member) => this.host!.identity(member))
          );
          for (const id of this.entrance.states.keys()) if (!activeIds.has(id)) this.entrance.remove(id);
        }
      }
    }
  }
  private updateResidency(deltaTime: number): void {
    if (!this.residency || this.closed) return;
    if (this.probeRevision !== this.revision) {
      for (const view of this.entries) this.refreshProbe(view);
      this.probeRevision = this.revision;
    }
    const now = performance.now();
    this.residency.updateDemand(deltaTime);
    this.residency.updatePresentation(now);
    if (!this.shown)
      for (const view of this.entries) {
        view.view.root.isActive = false;
        if (view.fine) view.fine.runtime.root.isActive = false;
      }
    if (this.entries.some((entry) => entry.retryAt !== undefined && now >= entry.retryAt)) this.detailDirty = true;
    if (
      !this.inputUpdates &&
      !this.terrainUpdate &&
      this.applied === this.revision &&
      !this.pending &&
      !this.detailPending &&
      this.detailDirty
    )
      this.detailPending = this.pumpDetails().finally(() => {
        this.detailPending = undefined;
      });
  }
  private async pumpDetails(): Promise<void> {
    this.detailDirty = false;
    while (!this.closed && !this.inputUpdates && !this.terrainUpdate && this.applied === this.revision) {
      const residency = this.residency!;
      residency.refreshPriorities();
      let view: View | undefined;
      for (const candidate of residency.desired) {
        if (candidate.fine || (candidate.retryAt !== undefined && candidate.retryAt > performance.now())) continue;
        if (!view || residency.compareResidency(candidate, view) > 0) view = candidate;
      }
      if (!view) return;
      if (!residency.admit(view)) {
        this.residencyMetrics.budgetDeferred++;
        return;
      }
      let fine: Candidate | undefined, build: Build | undefined;
      try {
        const input = this.input(view.frame);
        if (input.signature !== view.signature) {
          this.invalidate();
          return;
        }
        build = this.detailBuild = {
          frame: view.frame,
          bodies: input.bodies,
          signature: input.signature,
          controller: new AbortController(),
          checkedRevision: this.revision
        };
        this.residencyMetrics.detailAttempts++;
        fine = await prepareMasonry(input.document, {
          engine: this.engine,
          assets: input.assets,
          parent: view.frame,
          camera: this.host!.camera,
          signal: build.controller.signal,
          reuse: false,
          entrance: false,
          cpu: view.cpu,
          rigidDecorations: { poses: input.poses, resolve: (id) => this.resolve(id)?.entity },
          terrain: () => input.terrain
        });
        this.readTransforms();
        this.validateBuild(true);
        build.controller.signal.throwIfAborted();
        if (this.closed || this.views.get(view.frame) !== view || !residency.desired.has(view)) {
          fine.destroy();
          continue;
        }
        fine.commit();
        if (input.worldFrame) {
          const placement = input.document.placement!,
            rotation = new Quaternion(),
            matrix = new Matrix();
          Quaternion.rotationEuler(0, placement.rotationY, 0, rotation);
          Matrix.affineTransformation(
            new Vector3(1, 1, 1),
            rotation,
            new Vector3(...fine.grounding!.renderPosition),
            matrix
          );
          fine.runtime.root.transform.worldMatrix = matrix;
        }
        fine.runtime.setEntrance(this.entrance.states);
        view.fine = fine;
        fine = undefined;
        view.error = undefined;
        view.retryAt = undefined;
        residency.invalidate();
        residency.updatePresentation(performance.now());
        if (!this.shown) {
          view.view.root.isActive = false;
          view.fine.runtime.root.isActive = false;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      } catch (error) {
        fine?.destroy();
        if (!build?.controller.signal.aborted && !this.closed && this.views.get(view.frame) === view) {
          view.error = String(error);
          view.retryAt = performance.now() + 2000;
          this.residencyMetrics.detailFailures++;
          residency.invalidate();
        }
      } finally {
        this.detailBuild = undefined;
      }
    }
  }
  private updateLights(deltaSeconds: number): void {
    if (!this.host) return;
    this.lightDescriptors.length = 0;
    if (this.shown)
      for (const view of this.views.values())
        for (const light of view.lights) {
          if ((this.entrance.states.get(light.descriptor.ownerId)?.progress ?? 1) < 1) continue;
          const object = this.resolve(light.id);
          if (!object) continue;
          Vector3.transformCoordinate(light.local, object.entity.transform.worldMatrix, this.lightPosition);
          const p = light.descriptor.position;
          p[0] = this.lightPosition.x;
          p[1] = this.lightPosition.y;
          p[2] = this.lightPosition.z;
          this.lightDescriptors.push(light.descriptor);
        }
    if (!this.lights && this.lightDescriptors.length) this.lights = new ConstructionDecorationLights(this.entity, 4);
    this.lights?.update(this.lightDescriptors, this.host.camera, deltaSeconds);
  }
  private surfaceQueries(): ConstructionSurfaceQuery[] {
    if (!this.shown || !this.enabled || !this.entity.isActiveInHierarchy) return [];
    if (
      this.entries.some(
        (view) => !view.structureMatrix.every((value, i) => value === view.view.root.transform.worldMatrix.elements[i])
      )
    )
      this.surfaceRevision++;
    return this.queriesFor(this.entries.filter((view) => view.view.root.isActiveInHierarchy));
  }
  private queriesFor(entries: readonly View[]): ConstructionSurfaceQuery[] {
    return entries.map((view) => {
      const matrix = view.view.root.transform.worldMatrix,
        elements = matrix.elements;
      if (!view.worldStructure || !view.structureMatrix.every((value, index) => value === elements[index])) {
        view.worldStructure = view.structure.transformed(matrix);
        view.structureMatrix.set(elements);
      }
      return view.worldStructure;
    });
  }
  /** Structural surfaces from the published component geometry, including openings.
   * Independent of GPU residency and entrance animation; no planning OBB approximation. */
  get bounds() {
    return this.surfaceQueries().flatMap((query) => query.bounds);
  }
  captureSurfaceQuery() {
    return this.captureQueries(this.surfaceQueries());
  }
  private captureQueries(queries: readonly ConstructionSurfaceQuery[]) {
    return Object.freeze({
      intersectBounds(min: [number, number, number], max: [number, number, number]) {
        for (const query of queries) {
          const hit = query.intersectBounds(min, max);
          if (hit) return hit;
        }
        return null;
      }
    });
  }
  intersectSegment(start: [number, number, number], end: [number, number, number]) {
    let closest: ReturnType<ConstructionSurfaceQuery["intersectSegment"]> = null;
    for (const query of this.surfaceQueries()) {
      const hit = query.intersectSegment(start, end);
      if (hit && (!closest || hit.fraction < closest.fraction)) closest = hit;
    }
    return closest;
  }
  intersectCapsule(start: [number, number, number], end: [number, number, number], radius: number) {
    for (const query of this.surfaceQueries()) {
      const hit = query.intersectCapsule(start, end, radius);
      if (hit) return hit;
    }
    return null;
  }
  async inspectSurface(surface: BuildingSurfaceComponent, polygon?: number[][]) {
    if (!this.members.has(surface) || !this.host) throw Error("Building surface is not active");
    const view = this.entries.find((view) => view.bodies.some((body) => body.entity === surface.entity));
    if (!view) throw Error("Building surface has no published body");
    this.readTransforms();
    if (this.input(view.frame).signature !== view.signature) throw Error("Building has unpublished changes");
    const id = this.host.identity(surface);
    if (!surface.placementEnabled) return inspectMasonrySurface([], id, polygon);
    if (view.fine) return view.fine.inspectSurface(id, polygon);
    if (!view.inspection) {
      const input = this.input(view.frame),
        controller = new AbortController();
      if (input.signature !== view.signature) throw Error("Building has unpublished changes");
      const result = (async () => {
        retainBuildingResource(input.assets, 1);
        try {
          buildingAssets(input.assets);
          controller.signal.throwIfAborted();
          const layout = await view.cpu.compile(controller.signal);
          return resolveDocument(
            { document: layout.placementDocument, plans: layout.plans, groups: layout.groups },
            layout.placementDocument
          ).cells;
        } finally {
          retainBuildingResource(input.assets, -1);
        }
      })();
      view.inspection = { controller, result };
      void result.catch(() => {
        if (view.inspection?.controller === controller) view.inspection = undefined;
      });
    }
    const cells = await view.inspection.result;
    if (
      !this.members.has(surface) ||
      this.views.get(view.frame) !== view ||
      this.input(view.frame).signature !== view.signature
    )
      throw Error("Building changed during surface inspection");
    return inspectMasonrySurface(cells, id, polygon);
  }
  resolve(id: string): Member | undefined {
    const object = this.host?.resolve(id);
    if (
      (object instanceof MainBuildingComponent ||
        object instanceof DecorationComponent ||
        object instanceof BuildingSurfaceComponent) &&
      this.members.has(object)
    )
      return object;
  }
  visitPickBatches(visitor: RuntimePickVisitor): void {
    for (const view of this.views.values()) {
      view.view.visitPickBatches(visitor);
      for (const draw of view.fine?.runtime.draws.values() ?? [])
        for (const renderer of [draw.renderer, draw.lodRenderer]) {
          if (!renderer.enabled || !renderer.entity.isActiveInHierarchy) continue;
          const ids = draw.pickIds ?? [draw.pickId ?? draw.objectBinding?.id ?? draw.ownerId!];
          visitor({
            renderer,
            count: ids.length,
            resolve: (index) => ids[index],
            prepare: () => {
              if (draw.pickIds) renderer.shaderData.setFloat("renderer_MasonryPickObjects", 1);
            },
            restore: () => renderer.shaderData.setFloat("renderer_MasonryPickObjects", 0)
          });
        }
    }
  }
  metrics() {
    const count = (entity: Entity): number => 1 + entity.children.reduce((sum, child) => sum + count(child), 0);
    let draws = 0,
      renderers = 0,
      derivedEntities = count(this.entity);
    for (const view of this.entries) {
      for (const draw of view.fine?.runtime.draws.values() ?? []) {
        draws++;
        renderers += Number(draw.renderer.enabled) + Number(draw.lodRenderer.enabled);
      }
      if (view.fine) derivedEntities += count(view.fine.runtime.root);
      derivedEntities += count(view.view.root);
      const coarse = view.view.root.getComponentsIncludeChildren(MeshRenderer, []);
      draws += coarse.length;
      renderers += coarse.filter((renderer) => renderer.enabled && renderer.entity.isActiveInHierarchy).length;
    }
    const bodies = this.entries.flatMap((view) => view.bodies);
    this.residency?.refreshMetrics();
    return {
      ...this.residencyMetrics,
      authoredObjects: this.members.size,
      buildings: bodies.length,
      groups: this.views.size,
      houses: bodies.filter((body) => body.kind === "house").length,
      draws,
      enabledRenderers: renderers,
      derivedEntities,
      errors: [
        ...(this.error ? [String(this.error)] : []),
        ...this.entries.flatMap((view) => (view.error ? [view.error] : []))
      ]
    };
  }
  onDestroy(): void {
    this.terrainUpdate?.discard();
    this.closed = true;
    this.build?.controller.abort();
    this.detailBuild?.controller.abort();
    for (const view of [...this.views.values()]) this.retire(view);
    this.compiler.dispose();
    for (const flag of this.members.values()) flag.destroy();
    this.members.clear();
    this.lights?.dispose();
    if (this.ownerScene && systems.get(this.ownerScene) === this) systems.delete(this.ownerScene);
  }
}
Loader.registerClass("HouseComponent", HouseComponent);
Loader.registerClass("WallComponent", WallComponent);
Loader.registerClass("FenceComponent", FenceComponent);
Loader.registerClass("WindowComponent", WindowComponent);
Loader.registerClass("DoorComponent", DoorComponent);
Loader.registerClass("OpeningComponent", OpeningComponent);
Loader.registerClass("WallLampComponent", WallLampComponent);
Loader.registerClass("RoofWindowComponent", RoofWindowComponent);
Loader.registerClass("RoofHatchComponent", RoofHatchComponent);
Loader.registerClass("RoofLampComponent", RoofLampComponent);

Loader.registerClass("RectangularBuildingShape", RectangularBuildingShape);
Loader.registerClass("CircularBuildingShape", CircularBuildingShape);

Loader.registerClass("BuildingSurfaceComponent", BuildingSurfaceComponent);
