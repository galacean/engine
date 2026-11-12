import { initializePlanningPopulation } from "./PlanningPopulationInitialization";
import { PLANNING_FARMING_PROJECT_PATH } from "./farming/PlanningFarmInitialization";
import {
  preparePlanningWaterEdit,
  classifyPlanningWaterEdit,
  type PlanningEditOptions,
  type WaterEditOptions
} from "./hydrology/PlanningWaterEdits";
import { tryRevealSpatialWorld } from "./layout/SpatialWorld";
import { refreshSpatialInstanceInputs, tryEditSpatialInstances } from "./layout/SpatialInstanceEdits";
import { inheritPlanningHeightmap } from "../semantic-study/PlanningHeightmap";
import { inheritPlanningQueryData } from "./PlanningQueryDataOwner";
import { planningWaterCreation, type PlanningWaterCreation } from "./PlanningWaterAuthoring";
import { awaitPlanningPreparation } from "./PlanningPreparationCancellation";
import { isRockFormationOnlyEdit, prepareRockFormationEdit } from "../integrations/terrain/rock-formation/Edit.ts";
import { poiLandscapeConfig } from "../semantic-study/ContextLandscape";
import { defaultPoiLayout } from "../semantic-study/PoiDistribution";
import { poiTerritoryAreas, previewPoiTerritories, type PoiTerritoryPreviewEdit } from "./ecology/PoiTerritories";
import { readPath } from "./PlanningDocument";
import { resolveLandscapeInfluence } from "./ecology/LandscapeInfluences";
import { resolveFlowerInfluence } from "./ecology/FlowerInfluences";
import type { SemanticRecipe, SemanticResult } from "../semantic-study/WorldPlanningContract";
import {
  PLANNING_COMPONENTS,
  planningComponentAppliesTo,
  planningRegistry,
  refreshLayoutRuleChoices
} from "./PlanningComponents";
import {
  importPlanningDocument,
  upgradePlanningDocument,
  exportPlanningRecipe,
  exportPlanningAuthoring,
  type PlanningDocument
} from "./PlanningDocument";
import { applySpatialCommands, resolveComponent, type SpatialCommand } from "./SpatialDocument";
import { buildPlanningScene, updatePlanningScene, ancestors, type PlanningScene } from "./PlanningScene";
import { editableEntity, generatePlanningDocument, materializeComponentBases } from "./PlanningRuntime";
import { isGlobalPlanningScope, planningSeed, switchPlanningLayoutScope } from "./PlanningLayoutScope";
import {
  loadPlanningResourceJSON,
  validatePlanningResourceChanges,
  type PlanningResourceLoader
} from "./PlanningResourcePreflight";
/** Public authoring edits. Structural commands remain private to framework systems and migration. */
export type PlanningParameterCommand = Extract<SpatialCommand, { op: "set" | "reset" | "base" }>;
export type PlanningExecutor = (
  document: PlanningDocument,
  previous?: SemanticResult,
  signal?: AbortSignal
) => Promise<SemanticResult | undefined>;
export interface EditReceipt {
  status: "accepted" | "rejected" | "superseded";
  revision: number;
  changedIds: string[];
  diagnostics: SemanticResult["checks"];
  message?: string;
}
export interface PlanningPublication {
  /** Synchronous atomic scene swap; retain the previous scene if this throws. */
  commit(): void;
  /** Synchronize persistence/observers after author state is accepted. Failure
   * is reported separately and cannot roll back the already visible scene. */
  afterCommit?(): void | Promise<void>;
  /** Release unpublished resources. Must not throw; safe after commit. */
  discard(): void | Promise<void>;
}
export interface PlanningSessionOptions {
  /** Native hosts resolve the currently selected save; planning-only pages use the default asset. */
  farmingStatePath?: () => string | undefined;
  resourceLoader?: PlanningResourceLoader;
  history?: boolean;
  /** Isolated authoring validation never allocates or compares live projections. */
  authoringDraft?: boolean;
  /** Prepare detached resources after solving, including for load/undo/redo.
   * Authoring inputs are detached. Unchanged derived geometry is shared and must
   * remain immutable. Rejection or supersession discards staged resources.
   */
  preparePublication?: (
    document: PlanningDocument,
    result: SemanticResult,
    context: {
      previousDocument: PlanningDocument;
      forceFull?: boolean;
      worldUnchanged: boolean;
      contentOnly?: "reveal" | "instance";
      waterUpdate?: SemanticResult["waterUpdate"];
      signal?: AbortSignal;
      projectTransaction?: boolean;
      terrainTransitionDurationSeconds?: number;
    }
  ) => Promise<PlanningPublication>;
}
/** Presentation and runtime-only choices can share geometry, but a mixed
 * transaction still needs their publication. Keep explicit inheritance here. */
function presentationInputs(document: PlanningDocument): string {
  return JSON.stringify([
    document.farmInitializationRequests,
    Object.entries(document.entities)
      .flatMap(([id, entity]) => {
        const components = Object.entries(entity.components)
          .flatMap(([type, component]) => {
            const definition = PLANNING_COMPONENTS.find((item) => item.type === type);
            if (definition?.presentation || definition?.runtime) return [[type, component] as const];
            const runtimeFields = definition?.fields.filter((field) => field.affectsLayout === false) ?? [];
            const values = Object.fromEntries(
              Object.entries(component.values).filter(([key]) => runtimeFields.some((field) => field.key === key))
            );
            return Object.keys(values).length || (runtimeFields.length && component.base)
              ? [[type, { ...component, values }] as const]
              : [];
          })
          .sort(([a], [b]) => a.localeCompare(b));
        return components.length ? [[id, components]] : [];
      })
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
  ]);
}
/** Shared editing boundary for UI, tools and replay. Renderer state never enters the document. */
export class PlanningSession {
  document: PlanningDocument;
  result?: SemanticResult;
  scene?: PlanningScene;
  selectedId: string | null = null;
  pending = false;
  lastReceipt?: EditReceipt;
  private epoch = 0;
  private publicationHandler?: (
    document: PlanningDocument,
    result: SemanticResult,
    signal: AbortSignal,
    accept: () => void
  ) => Promise<void>;
  setPublicationHandler(handler: typeof this.publicationHandler): void {
    this.publicationHandler = handler;
  }
  setFarmingStatePathReader(read: () => string | undefined): void {
    this.options.farmingStatePath = read;
  }
  private projectEditPending = false;
  private projectionOutOfSync = false;
  private desired: PlanningDocument;
  private projectWaterEdit?: WaterEditOptions;
  private draftBase?: { document: PlanningDocument; result: SemanticResult };
  private draftHasSimpleWater = false;
  private terrainTransitionDurationSeconds?: number;
  private undoStack: { document: PlanningDocument; water?: WaterEditOptions }[] = [];
  private redoStack: { document: PlanningDocument; water?: WaterEditOptions }[] = [];
  private resourceCheck?: AbortController;
  private resourceLoader: PlanningResourceLoader;
  readonly journal: { commands: SpatialCommand[]; receipt: EditReceipt }[] = [];
  constructor(
    recipe: SemanticRecipe,
    private execute: PlanningExecutor = async (d, p) => generatePlanningDocument(d, p),
    document?: PlanningDocument,
    private options: PlanningSessionOptions = {}
  ) {
    this.resourceLoader = options.resourceLoader ?? loadPlanningResourceJSON;
    this.document = document ? upgradePlanningDocument(document) : importPlanningDocument(recipe);
    this.desired = this.document;
  }
  /** Isolated authoring session for an outer project transaction. No live scene or
   * persistence is touched during preparation. Runtime publication follows Scene Apply. */
  beginProjectEdit() {
    if (this.pending || !this.result) throw new Error("Planning world is not ready for a project edit");
    const original = this.document;
    const baseline = { document: this.document, result: this.result, outOfSync: this.projectionOutOfSync };
    const draft = this.forkAuthoringDraft();
    let phase: "open" | "preparing" | "prepared" | "committed" | "discarded" = "open";
    let publication: PlanningPublication | undefined;
    let acceptAuthoring: (() => void) | undefined;
    let needsPublication = false;
    let ownsLock = false;
    let activated = false;
    const release = () => {
      if (ownsLock) {
        this.projectEditPending = false;
        this.pending = false;
        ownsLock = false;
      }
    };
    const changed = () => JSON.stringify(draft.document) !== JSON.stringify(original);
    return {
      session: draft,
      invalidateResources: () => {
        if (phase !== "open") throw new Error("Resource invalidation must precede planning preparation");
        baseline.outOfSync = true;
      },
      hasEdits: changed,
      prepare: async (signal: AbortSignal) => {
        if (phase !== "open" || draft.pending) throw new Error("Planning project edit is not ready to prepare");
        signal.throwIfAborted();
        if (this.document !== original || this.pending) throw new Error("Planning edit base changed");
        phase = "preparing";
        draft.projectEditPending = true;
        this.projectEditPending = this.pending = ownsLock = true;
        try {
          needsPublication = changed() || baseline.outOfSync;
          if (changed()) acceptAuthoring = this.prepareAuthoring(draft.document, draft.result!);
          signal.throwIfAborted();
          if (phase !== "preparing") throw new Error("Planning project edit was discarded");
          phase = "prepared";
        } catch (error) {
          phase = "discarded";
          release();
          await publication?.discard();
          throw error;
        }
      },
      commit: () => {
        if (phase !== "prepared" || this.document !== original)
          throw new Error("Planning project edit is not prepared");
        if (acceptAuthoring) {
          acceptAuthoring();
          this.undoStack = draft.undoStack;
          this.redoStack = draft.redoStack;
          this.lastReceipt = draft.lastReceipt;
        }
        phase = "committed";
        release();
        if (needsPublication) this.projectionOutOfSync = true;
      },
      activate: async (signal = new AbortController().signal) => {
        if (phase !== "committed") throw new Error("Planning project edit is not committed");
        if (activated) return;
        activated = true;
        if (!needsPublication) return;
        try {
          publication = await awaitPlanningPreparation(
            this.preparePublication(
              draft.document,
              draft.result!,
              signal,
              true,
              draft.terrainTransitionDurationSeconds,
              draft.projectWaterEdit,
              baseline
            ),
            signal,
            (candidate) => candidate?.discard()
          );
          signal.throwIfAborted();
          publication?.commit();
          this.projectionOutOfSync = false;
          await publication?.afterCommit?.();
        } catch (error) {
          this.projectionOutOfSync = true;
          throw error;
        } finally {
          await publication?.discard();
        }
      },
      discard: async () => {
        if (phase === "committed" || phase === "discarded") return;
        phase = "discarded";
        draft.resourceCheck?.abort(new Error("Planning project edit discarded"));
        draft.projectEditPending = true;
        release();
        await publication?.discard();
      }
    };
  }
  /** A lightweight savepoint: author data is detached, immutable derived buffers are shared. */
  forkAuthoringDraft(): PlanningSession {
    if (this.pending || !this.result) throw new Error("Planning world is not ready for a draft");
    const draft = new PlanningSession(this.recipe(), this.execute, this.export(), {
      ...this.options,
      authoringDraft: true,
      resourceLoader: this.resourceLoader,
      preparePublication: undefined
    });
    draft.result = this.result;
    draft.draftBase = { document: this.document, result: this.result };
    draft.scene = this.scene;
    draft.undoStack = [...this.undoStack];
    draft.redoStack = [...this.redoStack];
    return draft;
  }
  /** Native hosts resolve virtual resource paths through their existing ResourceManager. */
  setResourceLoader(loader: PlanningResourceLoader): void {
    this.resourceLoader = loader;
  }
  async initialize(): Promise<void> {
    const document = this.export();
    applySpatialCommands(document, [], planningRegistry);
    let result = await this.execute(document);
    if (!result?.accepted)
      throw new Error(
        result?.checks
          .filter((c) => c.required && c.status === "fail")
          .map((c) => c.message)
          .join("；") || "初始规划失败"
      );
    const originalPlan = result.plan;
    result = { ...result, plan: { ...originalPlan } };
    inheritPlanningHeightmap(result.plan, originalPlan);
    refreshSpatialInstanceInputs(result.plan, document);
    const publication = await this.preparePublication(document, result);
    try {
      this.publish(document, result, publication);
    } finally {
      await publication?.discard();
    }
    await this.notifyPublication(publication);
  }
  private async notifyPublication(publication?: PlanningPublication): Promise<string | undefined> {
    try {
      await publication?.afterCommit?.();
    } catch (error) {
      const message = `场景已发布，但发布后同步失败：${String(error)}`;
      console.error(message);
      return message;
    }
  }
  private async preparePublication(
    document: PlanningDocument,
    result: SemanticResult,
    signal?: AbortSignal,
    projectTransaction = false,
    terrainTransitionDurationSeconds?: number,
    waterOptions?: WaterEditOptions,
    baseline = { document: this.document, result: this.result, outOfSync: this.projectionOutOfSync }
  ) {
    if (this.options.authoringDraft) return undefined;
    if (!this.options.preparePublication) return undefined;
    if (!baseline.outOfSync && baseline.result && result.waterUpdate) {
      const { update, reason } = classifyPlanningWaterEdit(
        baseline.document,
        document,
        baseline.result,
        waterOptions ?? result.waterUpdate.edit
      );
      if (update)
        return this.options.preparePublication(
          structuredClone(document),
          { ...result, waterUpdate: update },
          {
            previousDocument: baseline.document,
            worldUnchanged: false,
            waterUpdate: update,
            signal,
            projectTransaction
          }
        );
      result.waterUpdate = undefined;
      result.waterFallbackReason = reason;
    }
    if (
      !baseline.outOfSync &&
      baseline.result?.plan === result.plan &&
      JSON.stringify({ ...document, revision: 0 }) === JSON.stringify({ ...baseline.document, revision: 0 })
    )
      return undefined;
    if (!baseline.outOfSync && baseline.result?.plan === result.plan)
      return this.options.preparePublication(structuredClone(document), result, {
        previousDocument: baseline.document,
        worldUnchanged: true,
        signal,
        projectTransaction,
        terrainTransitionDurationSeconds
      });
    // Rock-only authoring already retained the canonical terrain and spatial solve.
    // Share that immutable result with the local publisher, just like content edits;
    // cloning the whole world here defeats residency identity and stalls the editor.
    if (!baseline.outOfSync && baseline.result && isRockFormationOnlyEdit(baseline.document, document))
      return this.options.preparePublication(structuredClone(document), result, {
        previousDocument: baseline.document,
        worldUnchanged: false,
        signal,
        projectTransaction,
        terrainTransitionDurationSeconds
      });
    // The runtime has verified unchanged base inputs. Keep immutable derived
    // buffers shared instead of serializing/cloning the entire world per brush.
    if (
      !baseline.outOfSync &&
      baseline.result &&
      result.contentUpdate &&
      presentationInputs(document) === presentationInputs(baseline.document) &&
      baseline.result.plan.spatialLayout?.landscapeBase?.signature ===
        result.plan.spatialLayout?.landscapeBase?.signature &&
      (!projectTransaction ||
        (JSON.stringify(baseline.result.plan.parameters) === JSON.stringify(result.plan.parameters) &&
          JSON.stringify(baseline.result.plan.routes) === JSON.stringify(result.plan.routes) &&
          JSON.stringify(baseline.result.plan.buildings) === JSON.stringify(result.plan.buildings)))
    )
      return this.options.preparePublication(structuredClone(document), result, {
        previousDocument: baseline.document,
        worldUnchanged: false,
        contentOnly: result.contentUpdate,
        signal,
        projectTransaction,
        terrainTransitionDurationSeconds
      });
    // Compare actual derived output, not command names; a replay may leave it unchanged.
    // Diagnostics describe the current execution, not rendered geometry. A
    // cached road run need not repeat every generation-only audit. Keep the new
    // checks in the published result, but do not rebuild the scene for them.
    const renderState = (plan: SemanticResult["plan"]) =>
      JSON.stringify({
        ...plan,
        planning: plan.planning ? { ...plan.planning, checks: [], changedIds: [] } : plan.planning,
        // Classifier keys include authored instance state. They decide which
        // preparation may run; changing them does not change world geometry.
        spatialLayout: plan.spatialLayout && {
          ...plan.spatialLayout,
          instanceInputSignature: undefined,
          revealInputSignature: undefined
        }
      });
    const worldUnchanged =
      !baseline.outOfSync &&
      !!baseline.result &&
      (baseline.result.plan === result.plan || renderState(baseline.result.plan) === renderState(result.plan));
    const detached = structuredClone(result);
    inheritPlanningHeightmap(detached.plan, result.plan);
    inheritPlanningQueryData(detached.plan, result.plan);
    return this.options.preparePublication(structuredClone(document), detached, {
      previousDocument: baseline.document,
      forceFull: baseline.outOfSync,
      worldUnchanged,
      signal,
      projectTransaction,
      terrainTransitionDurationSeconds
    });
  }
  private publish(document: PlanningDocument, result: SemanticResult, publication?: PlanningPublication): void {
    const acceptAuthoring = this.prepareAuthoring(document, result);
    publication?.commit();
    acceptAuthoring();
    this.projectionOutOfSync = false;
  }
  /** Allocate derived authoring state before crossing the durable publication boundary. */
  private prepareAuthoring(document: PlanningDocument, result: SemanticResult): () => void {
    const selectedPlaza = this.selectedId && this.scene?.entities.get(this.selectedId)?.kind === "plaza";
    const labels = (input: PlanningDocument) =>
      Object.values(input.entities)
        .filter((entity) => entity.name !== entity.id || entity.parent)
        .map((entity) => [entity.id, entity.name !== entity.id ? entity.name : undefined, entity.parent])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const canReuse =
      this.scene &&
      this.result &&
      result.contentUpdate &&
      JSON.stringify(labels(document)) === JSON.stringify(labels(this.document));
    const scene =
      (canReuse
        ? updatePlanningScene(this.scene!, this.result!.plan, result.plan, result.contentUpdate!)
        : undefined) ?? buildPlanningScene(result.plan);
    for (const entity of Object.values(document.entities)) {
      const output = scene.entities.get(entity.id);
      if (!output) continue;
      const name = entity.name !== entity.id ? entity.name : output.name,
        parent = entity.parent ?? output.parent;
      if (name !== output.name || parent !== output.parent) scene.entities.set(entity.id, { ...output, name, parent });
    }
    return () => {
      this.document = document;
      this.desired = document;
      this.result = result;
      this.scene = scene;
      if (
        this.selectedId &&
        !this.scene.entities.has(this.selectedId) &&
        (selectedPlaza || !document.entities[this.selectedId])
      )
        this.selectedId = null;
    };
  }
  select(id: string | null): void {
    if (id && !this.scene?.entities.has(id) && !this.document.entities[id]) throw new Error("对象不存在");
    this.selectedId = id;
  }
  describe() {
    refreshLayoutRuleChoices();
    return structuredClone(
      PLANNING_COMPONENTS.filter((d) => !d.legacy).map(
        ({ validate, fieldLimits, resources, global, local, kinds, ...definition }) => ({
          ...definition,
          fields: definition.fields
            .filter((f) => !f.hidden)
            .map((field) => ({
              ...field,
              worldWritable:
                !field.readonly &&
                (global ? !!global[field.key] : (!!definition.presentation && !kinds) || !!definition.runtime)
            })),
          scopes: {
            world: !!global || (!!definition.presentation && !kinds) || !!definition.runtime,
            instances: kinds ?? []
          }
        })
      )
    );
  }
  query(
    filter: {
      component?: string;
      kind?: string;
      name?: string;
      parent?: string;
      includeInternal?: boolean;
      authoredOnly?: boolean;
    } = {}
  ) {
    const all = new Map(this.scene?.entities ?? []);
    for (const entity of Object.values(this.document.entities)) {
      const prior = all.get(entity.id);
      all.set(entity.id, {
        ...prior,
        id: entity.id,
        name: entity.name,
        parent: entity.parent ?? prior?.parent,
        kind:
          prior?.kind ??
          (entity.components.poi
            ? "poi"
            : entity.components.rivers
              ? "water"
              : entity.components.lakes
                ? "lake"
                : "policy"),
        components: { ...prior?.components, ...entity.components }
      });
    }
    return [...all.values()]
      .filter((e) => filter.includeInternal || !e.components.display?.internal)
      .filter((e) => filter.component === "suppressed" || !e.components.suppressed?.values?.value)
      .filter(
        (e) =>
          (!filter.component ||
            e.components[filter.component] ||
            PLANNING_COMPONENTS.some((d) => d.type === filter.component && planningComponentAppliesTo(d, e))) &&
          (!filter.kind || e.kind === filter.kind) &&
          (!filter.name || e.name.includes(filter.name)) &&
          (!filter.parent || e.parent === filter.parent) &&
          (!filter.authoredOnly ||
            Object.entries(this.document.entities[e.id]?.components ?? {}).some(
              ([type, component]) =>
                (!filter.component || filter.component === type) &&
                (Object.keys(component.values).length || component.base)
            ))
      )
      .map((e) => ({
        id: e.id,
        name: e.name,
        kind: e.kind,
        parent: e.parent,
        authoredFields: Object.fromEntries(
          Object.entries(this.document.entities[e.id]?.components ?? {})
            .filter(([type]) => !filter.component || filter.component === type)
            .map(([type, component]) => [type, Object.keys(component.values)])
        ),
        authoredBases: Object.fromEntries(
          Object.entries(this.document.entities[e.id]?.components ?? {})
            .filter(([type, component]) => component.base && (!filter.component || filter.component === type))
            .map(([type, component]) => [type, { ...component.base }])
        ),
        components: [
          ...new Set([
            ...Object.keys(e.components),
            ...PLANNING_COMPONENTS.filter((d) => planningComponentAppliesTo(d, e)).map((d) => d.type)
          ])
        ]
      }));
  }
  /** Return concrete field values and their scope sources without materializing overrides. */
  inspect(id: string) {
    refreshLayoutRuleChoices();
    const scene = this.scene?.entities.get(id),
      entity = scene ? editableEntity(this.document, scene, this.result!.plan) : this.document.entities[id];
    if (!entity) throw new Error("对象不存在");
    const temporary = { ...this.document, entities: { ...this.document.entities, [id]: entity } };
    if (this.scene && this.result) materializeComponentBases(temporary, id, this.scene, this.result.plan);
    // The editable view includes published geometry and sampled defaults. Those
    // values are useful to display but must not become local authoring sources.
    // Retain the same explicit/implicit base graph, including lazy generated bases.
    const authoring = {
      ...temporary,
      entities: Object.fromEntries(
        Object.entries(temporary.entities).map(([entityId, item]) => [
          entityId,
          {
            ...item,
            components: Object.fromEntries(
              Object.entries(item.components).map(([type, component]) => [
                type,
                { ...component, values: this.document.entities[entityId]?.components[type]?.values ?? {} }
              ])
            )
          }
        ])
      )
    };
    return structuredClone({
      id,
      name: entity.name,
      parent: scene?.parent,
      kind:
        scene?.kind ??
        (entity.components.poi
          ? "poi"
          : entity.components.rivers
            ? "water"
            : entity.components.lakes
              ? "lake"
              : undefined),
      components: Object.keys(entity.components).map((type) => {
        const resolved = resolveComponent(temporary, id, type, planningRegistry);
        resolved.sources = resolveComponent(authoring, id, type, planningRegistry).sources;
        if (type === "suspensionBridge" && scene?.kind === "bridge") {
          const bridge = this.result?.plan.bridges.find((b) => b.id === id);
          for (const [key, value] of Object.entries(bridge?.suspension?.config ?? {}))
            if (!resolved.sources[key]?.length) resolved.values[key] = value;
        }
        if (type === "landscape" && scene?.components.poi) {
          const recipe = this.recipe(),
            site = scene.components.poi;
          const regional = recipe.edits[site.domainId]?.landscape;
          if (regional) {
            const effective = poiLandscapeConfig(
              recipe.parameters.poiLayout?.landscape ?? defaultPoiLayout().landscape,
              site,
              recipe.edits[id],
              recipe.edits[site.domainId]
            );
            for (const field of planningRegistry.get("landscape").fields) {
              resolved.values[field.key] = readPath(effective, field.key);
              if (
                readPath(regional, field.key) !== undefined &&
                readPath(recipe.edits[id]?.landscape, field.key) === undefined
              )
                resolved.sources[field.key] = [site.domainId];
            }
          }
        }
        if (type === "flowerInfluence" && scene?.components.flowerInfluence) {
          const legacy = {};
          resolved.values = {
            ...resolveFlowerInfluence(
              scene.components.flowerInfluence,
              legacy,
              Object.fromEntries(Object.entries(resolved.values).filter(([, v]) => v !== undefined))
            )
          };
        }
        if (type === "flowers" && scene?.components.flowerRegion)
          for (const field of planningRegistry.get(type).fields) {
            const value = readPath(scene.components.flowerRegion.config, field.key);
            if (value !== undefined) resolved.values[field.key] = value;
          }
        if (type === "landscapeInfluence" && scene?.components.landscapeInfluence)
          resolved.values = { ...resolveLandscapeInfluence(scene.components.landscapeInfluence, resolved.values) };
        if (type === "lakes" && scene?.kind === "lake" && !resolved.values.shoreline) {
          const water = this.result?.plan.waters.find((w) => w.id === id);
          if (water)
            resolved.values.shoreline = [water.outline, ...(water.lake?.holes ?? [])].flatMap((ring, k) =>
              ring.map((p, i) => ({
                id: `${id}:ring:${k}:${i}`,
                ring: k === 0 ? "shore" : `island-${k}`,
                x: p.x - Number(resolved.values.offsetX ?? 0),
                z: p.z - Number(resolved.values.offsetZ ?? 0)
              }))
            );
        }
        if (type === "rivers" && scene?.kind === "water") {
          const water = this.result?.plan.waters.find((w) => w.id === id);
          const surface = this.result?.plan.planning?.profiles.find((p) => p.ownerId === id && p.kind === "water");
          const bed = this.result?.plan.planning?.profiles.find((p) => p.ownerId === id && p.kind === "bed");
          if (!resolved.values.sections) resolved.values.sections = water?.course?.sections ?? [];
          if (surface && !resolved.values.points)
            resolved.values.points =
              water?.authorPoints ??
              water?.course?.points.map(({ bedElevation, ...point }) => point) ??
              surface.points.map((p, i) => ({
                id: `${id}:anchor:${i}`,
                x: p.x,
                z: p.z,
                elevation: p.y,
                width: water?.widths?.[i] ?? surface.width,
                depth: p.y - (bed?.points[i]?.y ?? p.y - 0.1)
              }));
        }
        if (type === "layout" && scene?.components.layout)
          resolved.values.memberCount = scene.components.layout.memberCount;
        if (type === "poi") {
          resolved.values.active = this.result?.plan.poiDistribution?.sites.find((site) => site.id === id)?.active;
          resolved.values.actualAreaM2 = this.result ? poiTerritoryAreas(this.result.plan).get(id) : undefined;
        }
        const definition = planningRegistry.get(type);
        const hidden = new Set(definition.fields.filter((field) => field.hidden).map((field) => field.key));
        const visible = <T>(values: Record<string, T>) =>
          Object.fromEntries(Object.entries(values).filter(([key]) => !hidden.has(key)));
        return {
          type,
          values: visible(resolved.values),
          sources: visible(resolved.sources),
          ...(entity.components[type].base ? { base: entity.components[type].base } : {}),
          limits: visible(definition.fieldLimits?.(resolved.values) ?? {}),
          local: visible(authoring.entities[id].components[type].values)
        };
      }),
      outputs: scene?.components
    });
  }
  private prepare(commands: SpatialCommand[]): PlanningDocument {
    refreshLayoutRuleChoices();
    let draft = structuredClone(this.desired);
    const materialize = (id: string) => {
      if (draft.entities[id]) return;
      const source = this.scene?.entities.get(id);
      if (!source) throw new Error("实体不存在：" + id);
      // A generated label is presentation, not an authored rename. The scene
      // continues to supply it until the user explicitly names this entity.
      draft.entities[id] = { id, name: id, components: {} };
    };
    const batch: SpatialCommand[] = [];
    for (const command of commands) {
      const prior = batch.at(-1);
      if (
        command.op === "set" &&
        prior?.op === "set" &&
        command.entity === prior.entity &&
        command.component === prior.component
      )
        prior.values = { ...prior.values, ...command.values };
      else batch.push(structuredClone(command));
    }
    for (const input of batch) {
      let command = input;
      if (command.op === "create") {
        if (this.scene?.entities.has(command.entity.id)) throw new Error("生成实体 ID 已存在，请编辑该实体");
        if (command.entity.parent) materialize(command.entity.parent);
        draft = { ...draft, ...applySpatialCommands(draft, [command], planningRegistry) };
        continue;
      }
      if (command.entity === "world" && ["remove", "detach", "parent"].includes(command.op))
        throw new Error("世界根组件不能移除或重挂");
      const id = command.entity;
      if (command.op === "set" && id === "world") {
        const component = command.component;
        const binding = PLANNING_COMPONENTS.find((d) => d.type === component)?.global;
        if (binding && Object.keys(command.values).some((key) => !binding[key]))
          throw new Error("该参数只支持实例作用域");
      }
      if (command.op === "set" && id !== "world")
        for (const key of Object.keys(command.values)) {
          const field = planningRegistry.get(command.component).fields.find((f) => f.key === key),
            kind =
              this.scene?.entities.get(id)?.kind ??
              (draft.entities[id]?.components.rivers
                ? "water"
                : draft.entities[id]?.components.lakes
                  ? "lake"
                  : undefined);
          if (field?.kinds && !field.kinds.includes(kind ?? "")) throw new Error("该参数不适用于选中对象：" + key);
        }
      materialize(id);
      // Generated defaults are temporary validation inputs, never authored overrides.
      const sparse = ["layout", "solid", "rockObb", "anchor", "poi", "roadWidth", "suspensionBridge"].includes(
        "component" in command ? command.component : ""
      );
      const authoredKeys = new Set(
        "component" in command ? Object.keys(draft.entities[id].components[command.component]?.values ?? {}) : []
      );
      if (command.op === "remove" && draft.entities[id].origin !== "authored") {
        command = draft.entities[id].components.suppressed
          ? { op: "set", entity: id, component: "suppressed", values: { value: true } }
          : { op: "attach", entity: id, component: "suppressed", data: { values: { value: true } } };
      }
      if (command.op === "parent" && command.parent) materialize(command.parent);
      if (
        (command.op === "set" || command.op === "reset" || command.op === "base") &&
        !draft.entities[id].components[command.component]
      ) {
        const scene = this.scene?.entities.get(id),
          available = scene && editableEntity(draft, scene, this.result!.plan).components[command.component];
        if (!available) throw new Error("该对象未提供组件：" + command.component);
        draft.entities[id].components[command.component] = available;
        if (
          ["solid", "appearance"].includes(command.component) &&
          (scene?.components.landscapeElement || scene?.components.guidanceMember)
        ) {
          const editable = editableEntity(draft, scene, this.result!.plan);
          if (editable.components.guidanceMember)
            draft.entities[id].components.guidanceMember ??= editable.components.guidanceMember;
          if (editable.components.solid) draft.entities[id].components.solid ??= editable.components.solid;
          if (editable.components.appearance)
            draft.entities[id].components.appearance ??= editable.components.appearance;
        }
      }
      // Resolve the requested source, including lazy generated entities, before validating the base command.
      if (command.op === "base")
        draft.entities[id].components[command.component].base = command.base
          ? structuredClone(command.base)
          : undefined;
      if (this.scene && this.result) materializeComponentBases(draft, id, this.scene, this.result.plan);
      if (sparse && command.op === "set") {
        const source = this.scene?.entities.get(id);
        if (source)
          draft.entities[id].components[command.component] = editableEntity(
            draft,
            source,
            this.result!.plan
          ).components[command.component];
        Object.keys(command.values).forEach((key) => authoredKeys.add(key));
      }
      if (sparse && command.op === "reset")
        (command.fields ?? [...authoredKeys]).forEach((key) => authoredKeys.delete(key));
      draft = { ...draft, ...applySpatialCommands(draft, [command], planningRegistry) };
      if (sparse && "component" in command)
        for (const key of Object.keys(draft.entities[id].components[command.component]?.values ?? {}))
          if (!authoredKeys.has(key)) delete draft.entities[id].components[command.component].values[key];
    }
    if (planningSeed(draft) !== planningSeed(this.desired)) {
      // Instance IDs refer to the currently published layout, not the not-yet-generated Seed.
      if (commands.some((c) => !isGlobalPlanningScope(c.op === "create" ? c.entity.id : c.entity)))
        throw new Error("切换 Seed 后再修改新布局的局部参数，请分两次提交");
      switchPlanningLayoutScope(draft, planningSeed(this.desired));
      applySpatialCommands(draft, [], planningRegistry);
    }
    // Population is an explicit layout operation. Reloads and local edits preserve
    // realized author inputs instead of reapplying a lasting capacity restriction.
    if (
      commands.some(
        (command) => "component" in command && command.entity === "world" && command.component === "population"
      ) &&
      JSON.stringify(resolveComponent(draft, "world", "population", planningRegistry).values) !==
        JSON.stringify(resolveComponent(this.desired, "world", "population", planningRegistry).values)
    )
      draft = initializePlanningPopulation(draft);
    const farm = resolveComponent(draft, "world", "farming", planningRegistry).values;
    const previousFarm = resolveComponent(this.desired, "world", "farming", planningRegistry).values;
    // Persist the request with authoring, before publication. Replays retain it;
    // only an explicit new choice creates another destructive initialization.
    if (
      farm.saveMode === "new" &&
      (commands.some(
        (c) => c.op === "set" && c.entity === "world" && c.component === "farming" && c.values.saveMode === "new"
      ) ||
        (planningSeed(draft) === planningSeed(this.desired) && previousFarm.saveMode !== "new"))
    ) {
      const statePath = this.options.farmingStatePath ? this.options.farmingStatePath() : PLANNING_FARMING_PROJECT_PATH;
      if (!statePath) throw Error("Select a FarmingSystem state asset before requesting a new farm");
      draft.farmInitializationRequests = {
        ...draft.farmInitializationRequests,
        [planningSeed(draft)]: { id: crypto.randomUUID(), statePath }
      };
    }
    draft.revision = this.desired.revision;
    return draft;
  }
  createWater(input: PlanningWaterCreation, expectedRevision?: number): Promise<EditReceipt> {
    try {
      return this.dispatch([planningWaterCreation(input)], expectedRevision);
    } catch (error) {
      return Promise.resolve({
        status: "rejected",
        revision: this.document.revision,
        changedIds: [],
        diagnostics: [],
        message: String(error)
      });
    }
  }
  removeWater(id: string, expectedRevision?: number): Promise<EditReceipt> {
    const kind = this.scene?.entities.get(id)?.kind;
    if (kind !== "water" && kind !== "lake")
      return Promise.resolve({
        status: "rejected",
        revision: this.document.revision,
        changedIds: [],
        diagnostics: [],
        message: "水体不存在"
      });
    // This planning API suppresses water. Source removal belongs to the native Scene transaction.
    return this.dispatchParameters(
      [{ op: "set", entity: id, component: kind === "lake" ? "lakes" : "rivers", values: { enabled: false } }],
      expectedRevision
    );
  }
  /** Validate the complete public batch before solving; unsupported operations cannot partly apply. */
  async dispatchParameters(
    commands: PlanningParameterCommand[],
    expectedRevision?: number,
    options?: PlanningEditOptions
  ): Promise<EditReceipt> {
    if (
      !Array.isArray(commands) ||
      commands.some((command) => !command || !["set", "reset", "base"].includes(command.op))
    )
      return {
        status: "rejected",
        revision: this.document.revision,
        changedIds: [],
        diagnostics: [],
        message: "公开接口仅接受参数 set / reset / base；内容增减由规划系统根据参数生成"
      };
    return this.dispatch(commands, expectedRevision, options);
  }
  /** Framework transaction primitive, including relation creation and legacy project migration. */
  async dispatch(
    commands: SpatialCommand[],
    expectedRevision?: number,
    options?: PlanningEditOptions
  ): Promise<EditReceipt> {
    if (expectedRevision !== undefined && expectedRevision !== this.document.revision)
      return {
        status: "rejected",
        revision: this.document.revision,
        changedIds: [],
        diagnostics: [],
        message: "编辑基准已变化，请重新读取"
      };
    let draft: PlanningDocument;
    try {
      draft = this.prepare(commands);
    } catch (error) {
      return (this.lastReceipt = {
        status: "rejected",
        revision: this.document.revision,
        changedIds: [],
        diagnostics: [],
        message: String(error)
      });
    }
    return this.commit(draft, commands, "edit", undefined, undefined, options?.water);
  }
  private async commit(
    draft: PlanningDocument,
    commands: SpatialCommand[],
    mode: "edit" | "undo" | "redo",
    signal?: AbortSignal,
    terrainTransitionDurationSeconds?: number,
    waterOptions?: WaterEditOptions,
    validateCandidate?: (document: PlanningDocument, result: SemanticResult) => void
  ): Promise<EditReceipt> {
    if (this.projectEditPending)
      return {
        status: "rejected",
        revision: this.document.revision,
        changedIds: [],
        diagnostics: [],
        message: "Project publication is pending"
      };
    const epoch = ++this.epoch;
    this.resourceCheck?.abort();
    const resourceCheck = (this.resourceCheck = new AbortController());
    signal = signal ? AbortSignal.any([resourceCheck.signal, signal]) : resourceCheck.signal;
    this.pending = true;
    this.desired = draft;
    let receipt: EditReceipt;
    let publication: PlanningPublication | undefined;
    try {
      await validatePlanningResourceChanges(
        this.document,
        draft,
        this.resourceLoader,
        signal ? AbortSignal.any([resourceCheck.signal, signal]) : resourceCheck.signal
      );
      if (epoch !== this.epoch)
        return { status: "superseded", revision: this.document.revision, changedIds: [], diagnostics: [] };
      // Presentation and runtime gameplay/loading choices have no spatial dependencies.
      const spatialState = (d: PlanningDocument) =>
        JSON.stringify({
          ...d,
          revision: 0,
          farmInitializationRequests: undefined,
          entities: Object.fromEntries(
            Object.entries(d.entities).map(([id, e]) => [
              id,
              {
                ...e,
                components: Object.fromEntries(
                  Object.entries(e.components)
                    .filter(([type]) => {
                      const definition = PLANNING_COMPONENTS.find((c) => c.type === type);
                      return !definition?.presentation && !definition?.runtime;
                    })
                    .map(([type, component]) => [
                      type,
                      {
                        ...component,
                        values: Object.fromEntries(
                          Object.entries(component.values).filter(
                            ([key]) =>
                              PLANNING_COMPONENTS.find((definition) => definition.type === type)?.fields.find(
                                (field) => field.key === key
                              )?.affectsLayout !== false
                          )
                        )
                      }
                    ])
                )
              }
            ])
          )
        });
      const batchWater =
        this.draftBase &&
        classifyPlanningWaterEdit(this.draftBase.document, draft, this.draftBase.result, this.projectWaterEdit);
      const localWater = this.result && classifyPlanningWaterEdit(this.document, draft, this.result, waterOptions);
      const forceFullWaterBatch =
        !!batchWater && !batchWater.update && (this.draftHasSimpleWater || !!localWater?.update);
      const waterEdit = this.result
        ? this.projectionOutOfSync
          ? { reason: "projection-out-of-sync" }
          : batchWater && !batchWater.update
            ? { reason: batchWater.reason }
            : preparePlanningWaterEdit(this.document, draft, this.result, waterOptions)
        : undefined;
      const rockOnly = !forceFullWaterBatch && !!this.result && isRockFormationOnlyEdit(this.document, draft);
      const runtimeChanged = PLANNING_COMPONENTS.some(
        (definition) =>
          definition.runtime &&
          Object.keys({ ...this.document.entities, ...draft.entities }).some(
            (id) =>
              JSON.stringify(this.document.entities[id]?.components[definition.type]) !==
              JSON.stringify(draft.entities[id]?.components[definition.type])
          )
      );
      const content =
        !forceFullWaterBatch && !waterEdit?.result && !rockOnly && this.result
          ? (tryEditSpatialInstances(draft, this.result) ?? tryRevealSpatialWorld(draft, this.result))
          : undefined;
      const presentationOnly =
        !forceFullWaterBatch &&
        !waterEdit?.result &&
        !rockOnly &&
        !content &&
        !!this.result &&
        spatialState(draft) === spatialState(this.document);
      let result =
        waterEdit?.result ??
        content ??
        (rockOnly
          ? { ...prepareRockFormationEdit(this.result!, draft), contentUpdate: undefined }
          : presentationOnly
            ? {
                ...this.result!,
                contentUpdate: undefined,
                parameterCorrections: undefined,
                execution: runtimeChanged ? ("runtime" as const) : ("presentation" as const),
                changedIds: [],
                timings: { [runtimeChanged ? "runtime" : "presentation"]: 0 }
              }
            : await awaitPlanningPreparation(this.execute(draft, this.result, signal), signal));
      if (epoch !== this.epoch || !result)
        return { status: "superseded", revision: this.document.revision, changedIds: [], diagnostics: [] };
      if (!waterEdit?.result) result = { ...result, waterUpdate: undefined, waterFallbackReason: waterEdit?.reason };
      if (result.accepted) {
        // Presentation and runtime-only changes do not prepare geometry or mutate the published plan.
        if (!presentationOnly && !result.waterUpdate) {
          for (const correction of result.parameterCorrections ?? []) {
            const component = draft.entities[correction.entity]?.components[correction.component];
            if (component) Object.assign(component.values, correction.values);
          }
          const originalPlan = result.plan;
          result.plan = { ...originalPlan };
          inheritPlanningHeightmap(result.plan, originalPlan);
          refreshSpatialInstanceInputs(result.plan, draft);
        }
        validateCandidate?.(draft, result);
        result.recipe = exportPlanningRecipe(draft);
        const dataChanged = new Set([...Object.keys(this.document.entities), ...Object.keys(draft.entities)]);
        result.changedIds = [
          ...new Set([
            ...result.changedIds,
            ...[...dataChanged].filter(
              (id) => JSON.stringify(this.document.entities[id]) !== JSON.stringify(draft.entities[id])
            )
          ])
        ];
        // The candidate scene and author document must carry the same eventual
        // revision. This detached draft is still unpublished until commit.
        draft.revision = this.document.revision + 1;
        publication = await awaitPlanningPreparation(
          this.preparePublication(draft, result, signal, false, terrainTransitionDurationSeconds, waterOptions),
          signal,
          (candidate) => candidate?.discard()
        );
        signal?.throwIfAborted();
        if (epoch !== this.epoch)
          return { status: "superseded", revision: this.document.revision, changedIds: [], diagnostics: [] };
        const previousDocument = this.document;
        let accepted = false;
        const accept = () => {
          signal!.throwIfAborted();
          if (epoch !== this.epoch) throw new Error("规划发布已过期");
          if (accepted) return;
          this.publish(draft, result!, publication);
          if (this.options.authoringDraft) {
            if (result!.waterUpdate) this.draftHasSimpleWater = true;
            if (waterOptions?.mode === "complex" || waterOptions?.affectTerrain || waterOptions?.rebuildShoreVegetation)
              this.projectWaterEdit = { ...waterOptions, mode: "complex" };
            if (terrainTransitionDurationSeconds !== undefined)
              this.terrainTransitionDurationSeconds = Math.max(
                this.terrainTransitionDurationSeconds ?? 0,
                terrainTransitionDurationSeconds
              );
          }
          accepted = true;
        };
        if (this.publicationHandler) await this.publicationHandler(draft, result, signal, accept);
        else accept();
        if (!accepted) throw new Error("宿主未接受规划发布");
        if (this.options.history !== false) {
          if (mode === "edit") {
            this.undoStack.push({ document: previousDocument, water: waterOptions });
            this.redoStack = [];
          } else if (mode === "undo") {
            this.undoStack.pop();
            this.redoStack.push({ document: previousDocument, water: waterOptions });
          } else {
            this.redoStack.pop();
            this.undoStack.push({ document: previousDocument, water: waterOptions });
          }
          if (this.undoStack.length > 50) this.undoStack.shift();
        }
      } else this.desired = this.document;
      receipt = {
        status: result.accepted ? "accepted" : "rejected",
        revision: this.document.revision,
        changedIds: result.changedIds,
        diagnostics: result.checks,
        message: result.accepted
          ? undefined
          : result.checks
              .filter((c) => c.required && c.status === "fail")
              .map((c) => c.message)
              .join("；")
      };
    } catch (error) {
      if (epoch !== this.epoch)
        return { status: "superseded", revision: this.document.revision, changedIds: [], diagnostics: [] };
      receipt = {
        status: "rejected",
        revision: this.document.revision,
        changedIds: [],
        diagnostics: [],
        message: String(error)
      };
      if (epoch === this.epoch) this.desired = this.document;
    } finally {
      await publication?.discard();
      if (epoch === this.epoch) {
        this.pending = false;
        this.resourceCheck = undefined;
      }
    }
    if (receipt.status === "accepted") {
      const warning = await this.notifyPublication(publication);
      if (warning) receipt.message = warning;
    }
    this.lastReceipt = receipt;
    this.journal.push({ commands: structuredClone(commands), receipt });
    if (this.journal.length > 200) this.journal.shift();
    return structuredClone(receipt);
  }
  async load(
    document: PlanningDocument,
    signal?: AbortSignal,
    terrainTransitionDurationSeconds?: number,
    waterOptions?: WaterEditOptions,
    validateCandidate?: (document: PlanningDocument, result: SemanticResult) => void
  ): Promise<EditReceipt> {
    try {
      document = upgradePlanningDocument(document);
      applySpatialCommands(document, [], planningRegistry);
    } catch (error) {
      return {
        status: "rejected",
        revision: this.document.revision,
        changedIds: [],
        diagnostics: [],
        message: String(error)
      };
    }
    return this.commit(
      structuredClone(document),
      [],
      "edit",
      signal,
      terrainTransitionDurationSeconds,
      waterOptions,
      validateCandidate
    );
  }
  async undo(): Promise<EditReceipt | undefined> {
    const entry = this.undoStack.at(-1);
    return entry
      ? this.commit(structuredClone(entry.document), [], "undo", undefined, undefined, entry.water)
      : undefined;
  }
  async redo(): Promise<EditReceipt | undefined> {
    const entry = this.redoStack.at(-1);
    return entry
      ? this.commit(structuredClone(entry.document), [], "redo", undefined, undefined, entry.water)
      : undefined;
  }
  get canUndo() {
    return !!this.undoStack.length;
  }
  get canRedo() {
    return !!this.redoStack.length;
  }
  export() {
    return exportPlanningAuthoring(this.document);
  }
  /** Lightweight, non-persistent preview of accepted POI ownership; commit through parameter authoring.
   * @param edit Provisional weight and/or world coordinates for one existing POI.
   * @returns The accepted document revision, edited POI identity and provisional land-clipped cells with actual areas.
   * @throws If planning is not ready, the POI is absent, or the provisional values are invalid.
   */
  previewPoi(edit: PoiTerritoryPreviewEdit) {
    if (!this.result) throw new Error("规划尚未就绪");
    return { revision: this.document.revision, poiId: edit.id, cells: previewPoiTerritories(this.result.plan, edit) };
  }
  recipe() {
    return exportPlanningRecipe(this.document);
  }
  ancestors(id: string) {
    return this.scene ? ancestors(this.scene, id) : [];
  }
  /** Delete published content through a durable exclusion, distinct from hiding a layer. */
  remove(id: string) {
    return this.dispatch([{ op: "remove", entity: id }]);
  }
}
