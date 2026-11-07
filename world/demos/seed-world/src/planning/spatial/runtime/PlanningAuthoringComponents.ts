import { AssetType, Loader, Script, type Entity, type JSONAsset } from "@galacean/engine";
export { PlanningGroundWind } from "./PlanningGroundWind";
import { exportPlanningAuthoring, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import {
  PLANNING_ENTITY_COMPONENT, PLANNING_PROJECT_COMPONENT, PLANNING_SEED_ARCHIVE_COMPONENT,
  restorePlanningEntity, splitPlanningEntity,
  type PlanningProjectMetadata, type PlanningSeedArchiveMetadata, type PlanningEntityIdentity
} from "../PlanningSceneAsset";
import {
  PLANNING_VISUAL_AUTHORING, RETIRED_PLANNING_VISUAL_AUTHORING, visualAuthoringProperties,
  type AuthoredColor, type AuthoredPlantMaterialSlot, type ParameterBase
} from "../PlanningVisualAuthoring";
import type { PlanningParameterCommand, PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import type { SpatialEntity } from "@galacean/engine-world-planning/spatial/SpatialDocument";

/** Stable identity and only the remaining spatial adapter state. Visual fields live on sibling components. */
export class PlanningEntityAuthoring extends Script implements PlanningEntityIdentity {
  declare planningId: string;
  declare origin?: SpatialEntity["origin"];
  declare parentId?: string;
  spatialComponents: SpatialEntity["components"] = {};
  /** Import-only compatibility for Scene files written before native domain components. */
  declare authoring?: SpatialEntity;
}

/** Base links preserve set/reset/base semantics without filling inherited/default fields. */
abstract class VisualParameterAuthoring extends Script {
  declare parameterBase?: ParameterBase;
  constructor(entity: Entity) {
    super(entity);
    const registration = visualRegistrations.find(({ Class }) => this instanceof Class);
    if (registration) for (const key of visualAuthoringProperties(registration.descriptor)) {
      // Sparse Source fields still need a real native property before their first edit.
      // Preserve accessors (notably profileUrl); undefined continues to mean inheritance.
      if (!(key in this)) Object.defineProperty(this, key, { value: undefined, writable: true, enumerable: true, configurable: true });
    }
  }
}
/** Old Scene files can load retired Script identities without restoring their capabilities. */
class RetiredVisualAuthoring extends Script {}
export interface PlanningLightingProfileReference {
  /** The authored virtual identity; resource packaging may map it to a different physical URL. */
  readonly url: string;
  readonly asset?: JSONAsset;
}
export class PlanningLighting extends VisualParameterAuthoring {
  declare timeHours?: number;
  declare sunIntensity?: number;
  declare sunColor?: AuthoredColor;
  declare ambientIntensity?: number;
  declare iblIntensity?: number;
  declare customSkyTintStrength?: number;
  declare customSkyZenithTint?: AuthoredColor;
  declare customSkyHorizonTint?: AuthoredColor;
  declare skyExposure?: number;
  declare skyTint?: AuthoredColor;
  declare sunSize?: number;
  declare atmosphereThickness?: number;
  declare starIntensity?: number;
  declare moonLightIntensity?: number;
  declare moonColor?: AuthoredColor;
  declare moonDiskIntensity?: number;
  declare moonAtmosphereIntensityScale?: number;
  declare twilightIntensity?: number;
  declare airglowIntensity?: number;
  declare fogRadianceIntensity?: number;
  declare fogTint?: AuthoredColor;
  declare groundTint?: AuthoredColor;
  declare direct?: boolean;
  declare environment?: boolean;
  declare shadows?: boolean;
  declare shadowStrength?: number;
  declare fog?: boolean;
  declare fogDensity?: number;
  private reference?: PlanningLightingProfileReference;
  /** Atomic binding avoids property-resolution order changing the authored asset identity. */
  get profileReference(): PlanningLightingProfileReference | undefined { return this.reference; }
  set profileReference(reference: PlanningLightingProfileReference | undefined) {
    if (reference && (typeof reference.url !== "string" || !reference.url)) throw new Error("Invalid lighting profile identity");
    this.reference = reference ? { ...reference } : undefined;
  }
  /** Native editors can assign {url, asset} to profileReference when selecting a virtual asset. */
  get profile(): JSONAsset | undefined { return this.reference?.asset; }
  set profile(asset: JSONAsset | undefined) {
    if (!asset) { this.reference = undefined; return; }
    if (this.reference?.asset === asset) return;
    const url = this.engine.resourceManager.getAssetPath(asset.instanceId);
    if (!url) throw new Error("Register the lighting profile asset before assigning it");
    this.reference = { url, asset };
  }
  get profileUrl(): string | undefined { return this.reference?.url; }
  set profileUrl(url: string | undefined) {
    if (url === this.reference?.url) return;
    this.profileReference = url === undefined ? undefined : { url };
  }
  /** Public ResourceManager.load resolves virtual paths and caches; author identity remains unchanged. */
  async resolveProfile(): Promise<void> {
    const reference = this.reference;
    if (!reference || reference.asset) return;
    const asset = await this.engine.resourceManager.load<JSONAsset>({ url: reference.url, type: AssetType.JSON });
    if (this.reference === reference && !this.destroyed) this.reference = { url: reference.url, asset };
  }
}
export class PlanningPostProcess extends VisualParameterAuthoring {
  declare postProcessingEnabled?: boolean;
  declare tonemapping?: boolean;
  declare postExposure?: number;
  declare temperature?: number;
  declare contrast?: number;
  declare saturation?: number;
  declare bloom?: boolean;
  declare bloomThreshold?: number;
  declare bloomIntensity?: number;
  declare bloomScatter?: number;
}
export class PlanningFlowers extends VisualParameterAuthoring {
  /** Fraction of plantable ground occupied by flower regions. */
  declare coverage?: number;
  /** Clumps per square metre inside the regions. */
  declare densityPerM2?: number;
  declare patchSizeM?: number;
  declare maxSlopeDegrees?: number;
  declare assetWeights?: Record<string, number>;
}
export class PlanningPlantMaterials extends VisualParameterAuthoring {
  declare materialSlots?: AuthoredPlantMaterialSlot[];
}
/** Resource selection is authored independently from distribution and per-instance appearance. */
export class PlanningVegetationResources extends Script {
  declare catalog: JSONAsset;
  declare appearance: JSONAsset;
  declare production: JSONAsset;
}
export class PlanningSubjectView extends VisualParameterAuthoring {
  declare subjectId?: string;
  declare frameFraction?: number;
  declare fovDegrees?: number;
  declare azimuthDegrees?: number;
  declare distanceM?: number;
}
export class PlanningGrassAppearance extends VisualParameterAuthoring {
  declare colorA?: AuthoredColor;
  declare colorB?: AuthoredColor;
  declare saturation?: number;
}
/** Terrain vegetation controls retain their authored units and sparse inheritance. */
export class PlanningVegetation extends VisualParameterAuthoring {
  declare vegetation?: Partial<Record<"trees" | "shrubs" | "grass" | "herbs" | "cover" | "flowers" | "litter", number>>;
  declare plantSizes?: Record<string, { scaleMin?: number; scaleMax?: number }>;
  declare treeHeightMinM?: number;
  declare treeHeightMaxM?: number;
  declare density?: number;
  declare edgeDensity?: number;
  declare falloffRatio?: number;
  declare boundaryBlendM?: number;
  declare maxAltitudeM?: number;
  declare maxSlopeDegrees?: number;
  declare grassRelativeHeight?: number;
  declare grassHeightVariation?: number;
  declare roadsideGrassHeightRatio?: number;
  declare roadsideBandM?: number;
  declare roadsideDensityMultiplier?: number;
  declare solidEdgeBandM?: number;
  declare solidEdgeDensityMultiplier?: number;
  declare contexts?: Partial<Record<"openland" | "road" | "building" | "landform" | "poi", number>>;
  declare legacyPlantSizes?: { id: string; scaleMin?: number; scaleMax?: number }[];
}
export class PlanningVegetationPopulation extends VisualParameterAuthoring {
  declare multiplier?: number;
  declare samplingDensityPer1000M2?: number;
}
export class PlanningVegetationInfluence extends VisualParameterAuthoring {
  declare densityMultiplier?: number;
  declare treeHeightMinM?: number;
  declare treeHeightMaxM?: number;
}
export class PlanningFlowerInfluence extends VisualParameterAuthoring {
  declare influenceEnabled?: boolean;
  declare bandM?: number;
  declare multiplier?: number;
  declare falloff?: number;
}
/** Native sparse authoring for the shared procedural rock generator. */
export class PlanningRockFormation extends VisualParameterAuthoring {
  declare color?: AuthoredColor;
  declare textureScale?: number;
  declare topScale?: number;
  declare bottomScale?: number;
  declare shoulderScale?: number;
  declare shoulderHeight?: number;
  declare topRoughness?: number;
  declare topSlope?: number;
  declare wallCount?: number;
  declare wallOverlap?: number;
  declare wallProtrusion?: number;
  declare wallLength?: number;
  declare wallTilt?: number;
  declare wallStrength?: number;
  declare outlineIrregularity?: number;
  declare variation?: number;
  declare simplifyError?: number;
}
export class PlanningSeedArchiveAuthoring extends Script {
  declare metadata: PlanningSeedArchiveMetadata;
}

const nativeVisualClasses = {
  PlanningVegetation, PlanningVegetationPopulation, PlanningVegetationInfluence, PlanningFlowerInfluence,
  PlanningLighting, PlanningPostProcess, PlanningFlowers, PlanningPlantMaterials, PlanningSubjectView, PlanningGrassAppearance,
  PlanningRockFormation
};
const visualRegistrations = PLANNING_VISUAL_AUTHORING.map((descriptor) => ({ descriptor,
  Class: nativeVisualClasses[descriptor.type as keyof typeof nativeVisualClasses] as new (entity: Entity) => VisualParameterAuthoring
}));

export class PlanningProjectAuthoring extends Script {
  declare metadata: PlanningProjectMetadata;
  declare hasSeedArchives?: boolean;
  private session?: PlanningSession;
  private publish?: () => Promise<void>;
  /** Hosts may await native resource readiness after bind; author values are available synchronously. */
  resourcesReady: Promise<void> = Promise.resolve();

  bind(session: PlanningSession, publish: () => Promise<void>): void {
    this.session = session;
    this.publish = publish;
    session.setResourceLoader(async (url) =>
      (await this.engine.resourceManager.load<JSONAsset>({ url, type: AssetType.JSON })).data);
    this.synchronize(session.document);
  }
  /** Native editor integrations and runtime tools use the same transaction, not property mutation. */
  async apply(commands: PlanningParameterCommand[], expectedRevision: number) {
    if (!this.session) throw new Error("Bind the loaded planning authoring to a PlanningSession before editing");
    const receipt = await this.session.dispatchParameters(commands, expectedRevision);
    if (receipt.status === "accepted") {
      this.synchronize(this.session.document);
      await this.resourcesReady;
      // The Session's simple-water publication already synchronized the water projection.
      // A generic follow-up would reset unrelated farming and ecosystem consumers.
      if (!this.session.result?.waterUpdate) await this.publish?.();
    }
    return receipt;
  }
  readDocument(): PlanningDocument {
    const { layoutOverrides: legacyArchives, ...metadata } = this.metadata as PlanningProjectMetadata & Pick<PlanningDocument, "layoutOverrides">;
    const archives = structuredClone(legacyArchives ?? {});
    let hasArchives = this.hasSeedArchives || legacyArchives !== undefined;
    for (const child of this.entity.children) {
      const archive = child.getComponent(PlanningSeedArchiveAuthoring);
      if (!archive) continue;
      const { seed, ...parameters } = archive.metadata;
      if (!seed || Object.hasOwn(archives, seed)) throw new Error("Invalid or duplicate planning seed archive");
      Object.defineProperty(archives, seed, { value: { ...parameters, entities: readEntities(child) }, enumerable: true });
      hasArchives = true;
    }
    return exportPlanningAuthoring({ ...metadata, entities: readEntities(this.entity),
      ...(hasArchives ? { layoutOverrides: archives } : {}) });
  }
  synchronize(document: PlanningDocument): void {
    const { entities, layoutOverrides, ...metadata } = exportPlanningAuthoring(document);
    this.metadata = metadata;
    this.hasSeedArchives = layoutOverrides !== undefined;
    synchronizeEntities(this.entity, entities);
    const remaining = new Map(Object.entries(layoutOverrides ?? {}));
    for (const child of [...this.entity.children]) {
      const archive = child.getComponent(PlanningSeedArchiveAuthoring);
      if (!archive) continue;
      const source = remaining.get(archive.metadata.seed);
      if (!source) child.destroy();
      else {
        const { entities, ...parameters } = source;
        archive.metadata = { seed: archive.metadata.seed, ...parameters };
        synchronizeEntities(child, entities);
        remaining.delete(archive.metadata.seed);
      }
    }
    for (const [seed, { entities, ...parameters }] of remaining) {
      const child = this.entity.createChild(`Seed ${seed} authoring`);
      child.addComponent(PlanningSeedArchiveAuthoring).metadata = { seed, ...parameters };
      synchronizeEntities(child, entities);
    }
    const lighting: PlanningLighting[] = [];
    this.entity.getComponentsIncludeChildren(PlanningLighting, lighting);
    this.resourcesReady = Promise.all(lighting.map((component) => component.resolveProfile())).then(() => undefined);
    // Preserve a rejected readiness promise for the host without an unhandled rejection before it awaits.
    void this.resourcesReady.catch(() => undefined);
  }
}

/** Native children are authoring records; parameter ownership stays in the explicit parentId adapter. */
function readEntities(parent: Entity): Record<string, SpatialEntity> {
  const entities: Record<string, SpatialEntity> = {};
  for (const child of parent.children) {
    const identity = child.getComponent(PlanningEntityAuthoring);
    if (!identity) continue;
    const visual = visualRegistrations.flatMap(({ descriptor, Class }) => {
      const component = child.getComponent(Class);
      if (!component) return [];
      const props = Object.fromEntries(visualAuthoringProperties(descriptor).map((key) =>
        [key, (component as unknown as Record<string, unknown>)[key]]).filter(([, value]) => value !== undefined));
      return [{ type: descriptor.type, props }];
    });
    const authoring = restorePlanningEntity(child.name, identity as unknown as Record<string, unknown>, visual);
    if (!authoring.id || Object.hasOwn(entities, authoring.id)) throw new Error("Invalid or duplicate planning entity");
    Object.defineProperty(entities, authoring.id, { value: authoring, enumerable: true });
  }
  return entities;
}
function synchronizeEntities(parent: Entity, entities: Record<string, SpatialEntity>): void {
  const remaining = new Map(Object.entries(entities));
  const synchronize = (child: Entity, component: PlanningEntityAuthoring, authoring: SpatialEntity) => {
    child.getComponent(RetiredVisualAuthoring)?.destroy();
    const { identity, visual } = splitPlanningEntity(authoring);
    component.authoring = undefined;
    component.planningId = identity.planningId;
    component.origin = identity.origin;
    component.parentId = identity.parentId;
    component.spatialComponents = identity.spatialComponents;
    child.name = authoring.name;
    for (const { descriptor, Class } of visualRegistrations) {
      const record = visual.find((record) => record.type === descriptor.type);
      const existing = child.getComponent(Class);
      if (!record) { existing?.destroy(); continue; }
      const native = (existing ?? child.addComponent(Class)) as unknown as Record<string, unknown>;
      for (const key of visualAuthoringProperties(descriptor)) native[key] = record.props[key];
    }
  };
  for (const child of [...parent.children]) {
    const identity = child.getComponent(PlanningEntityAuthoring);
    if (!identity) continue;
    const id = identity.planningId ?? identity.authoring?.id;
    const source = remaining.get(id);
    if (!source) child.destroy();
    else { synchronize(child, identity, source); remaining.delete(id); }
  }
  for (const authoring of remaining.values()) {
    const child = parent.createChild(authoring.name);
    synchronize(child, child.addComponent(PlanningEntityAuthoring), authoring);
  }
}
Loader.registerClass(PLANNING_PROJECT_COMPONENT, PlanningProjectAuthoring);
Loader.registerClass("PlanningVegetationResources", PlanningVegetationResources);
Loader.registerClass(PLANNING_ENTITY_COMPONENT, PlanningEntityAuthoring);
Loader.registerClass(PLANNING_SEED_ARCHIVE_COMPONENT, PlanningSeedArchiveAuthoring);
for (const { descriptor, Class } of visualRegistrations) Loader.registerClass(descriptor.type, Class);
for (const retired of RETIRED_PLANNING_VISUAL_AUTHORING) Loader.registerClass(retired.type, RetiredVisualAuthoring);

export function mountPlanningAuthoring(parent: Entity, session: PlanningSession, publish: () => Promise<void>) {
  const component = parent.createChild("Planning authoring").addComponent(PlanningProjectAuthoring);
  component.bind(session, publish);
  return component;
}
