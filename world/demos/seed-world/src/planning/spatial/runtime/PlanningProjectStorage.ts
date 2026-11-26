import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { exportPlanningAuthoring, exportPlanningRecipe, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { planningSeed } from "@galacean/engine-world-planning/spatial/PlanningLayoutScope";
import { parsePlanningDocument, PLANNING_PROJECT_PATH } from "../PlanningDocumentCodec.ts";
import { exportPlanningScene } from "../PlanningSceneAsset.ts";
import { RuntimeProjectEdit, type RuntimeAssetFormat } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { planningSourceDocument, retainPlanningWaterSource, writePlanningProjectSource } from "./PlanningProjectSource.ts";
import { clearPlanningWaterSource, initializePlanningWater, initializePlanningOcean, installPlanningWaterDefaults, loadPlanningWaterDefaults, waterInitialization, waterInitializationPath } from "./PlanningWaterInitialization.ts";
import type { SemanticResult } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";

export { PLANNING_PROJECT_PATH };
export const PLANNING_PROJECT_TYPE = "SeedWorldPlanning";

/** Project asset is the sole source of persisted planning state. */
export class PlanningProjectStorage {
  constructor(
    private readonly project: Pick<RuntimeProjectSession, "projectPackage" | "publish"> &
      Partial<Pick<RuntimeProjectSession, "update" | "publicationRevision" | "id">>,
    private readonly formats: ReadonlyMap<string, RuntimeAssetFormat> = new Map()
  ) {}

  retainWater(document: PlanningDocument): PlanningDocument {
    return retainPlanningWaterSource(document, this.project.projectPackage);
  }

  /** Older boolean requests get a stable identity without rewriting the source project. */
  get pendingWaterReset(): string | undefined {
    const pending = waterInitialization(this.project.projectPackage).resetPending;
    return pending === true ? `legacy:${this.project.id ?? this.project.projectPackage.project.scene}` : pending;
  }

  /** True when lake/river/ocean default materials are already registered in the project manifest. */
  get hasCoreWaterDefaults(): boolean {
    const existingFiles = new Set(this.project.projectPackage.project.files.map((file) => file.virtualPath));
    return ["lake", "river", "ocean"].every((kind) => existingFiles.has(`Water/Materials/${kind}.mat`));
  }

  /** New Source authoring baseline is ready before the first Engine Scene load. */
  async initialize(
    document: PlanningDocument,
    result: SemanticResult,
    waterResetRequest?: string,
    { userEdit = false }: { userEdit?: boolean } = {}
  ): Promise<PlanningDocument> {
    const defaults = this.hasCoreWaterDefaults ? undefined : await loadPlanningWaterDefaults();
    const build = (pack: RuntimeProjectSession["projectPackage"]) => {
      const draft = new RuntimeProjectEdit(pack, new Map([...nativeAssetFormats(() => ({})), ...this.formats]));
      const request = waterResetRequest ?? this.pendingWaterReset;
      const applied = new Set(waterInitialization(pack).appliedResets ?? []);
      if (request && !applied.has(request)) clearPlanningWaterSource(draft);
      if (defaults) installPlanningWaterDefaults(draft, defaults);
      const next = initializePlanningWater(draft, document, result.plan);
      writePlanningProjectSource(draft, pack.project.scene, next);
      initializePlanningOcean(draft, result.plan);
      const state = waterInitialization(draft.preview());
      delete state.resetPending;
      if (request) state.appliedResets = [...applied.add(request)];
      draft.writeDocument(waterInitializationPath(pack.project.scene), JSON.stringify(state));
      draft.writeDocument(`${pack.project.scene}.planning-source.json`, JSON.stringify({ version: 1 }));
      return draft.finish();
    };
    if (this.project.update) await this.project.update(build, { userEdit });
    else await this.project.publish(build(this.project.projectPackage), undefined, undefined, undefined, { userEdit });
    return planningSourceDocument(this.project.projectPackage)!;
  }

  async load(seed: number): Promise<PlanningDocument | undefined> {
    const source = planningSourceDocument(this.project.projectPackage);
    if (source) return parsePlanningDocument(JSON.stringify(source), planningSeed(source));
    const content = this.project.projectPackage.contents[PLANNING_PROJECT_PATH];
    if (content === undefined) return undefined;
    if (typeof content !== "string") throw new Error("Planning project asset must contain JSON text");
    return parsePlanningDocument(content, seed);
  }

  async clear(): Promise<void> {
    const pack = this.project.projectPackage;
    if (planningSourceDocument(pack)) {
      const build = (current: RuntimeProjectSession["projectPackage"]) => {
        const draft = new RuntimeProjectEdit(current, new Map([...nativeAssetFormats(() => ({})), ...this.formats]));
        const source = planningSourceDocument(current)!;
        writePlanningProjectSource(draft, current.project.scene, createSeedPlanningDocument(exportPlanningRecipe(source).parameters.seed));
        return draft.finish();
      };
      if (this.project.update) await this.project.update(build);
      else await this.project.publish(build(pack));
      return;
    }
    const contents = { ...pack.contents };
    delete contents[PLANNING_PROJECT_PATH];
    await this.project.publish({
      ...pack,
      contents,
      project: {
        ...pack.project,
        files: pack.project.files.filter((file) => file.virtualPath !== PLANNING_PROJECT_PATH)
      }
    });
  }

  /** Import the saved envelope before loading the Scene, or replace planning after an explicit template choice. */
  async migrateToSource(document: PlanningDocument, replacePlanning = false): Promise<void> {
    const initialPack = this.project.projectPackage;
    const initialMarker = `${initialPack.project.scene}.planning-source.json`;
    const skipInitial =
      initialPack.documents?.[initialMarker] !== undefined &&
      JSON.parse(initialPack.documents[initialMarker]).version === 2 &&
      !replacePlanning;
    const candidateDoc = replacePlanning ? document : planningSourceDocument(initialPack) ?? document;
    const defaults = !skipInitial && needsWaterDefaults(initialPack, candidateDoc)
      ? await loadPlanningWaterDefaults()
      : undefined;
    const build = (pack: RuntimeProjectSession["projectPackage"]) => {
      const marker = `${pack.project.scene}.planning-source.json`;
      if (pack.documents?.[marker] !== undefined) {
        const { version } = JSON.parse(pack.documents[marker]);
        if (version === 2 && !replacePlanning) return pack;
        if (version !== 1 && version !== 2) throw new Error("Unsupported planning Source migration");
        if (!planningSourceDocument(pack)) throw new Error("Imported project requires a PlanningProjectAuthoring owner");
      }
      const draft = new RuntimeProjectEdit(pack, new Map([...nativeAssetFormats(() => ({})), ...this.formats]));
      if (defaults) installPlanningWaterDefaults(draft, defaults);
      // Store planning authoring in the Scene before loading its native owners.
      writePlanningProjectSource(draft, pack.project.scene, replacePlanning ? document : planningSourceDocument(pack) ?? document);
      if (draft.list().some(file => file.virtualPath === PLANNING_PROJECT_PATH)) draft.delete(PLANNING_PROJECT_PATH);
      draft.writeDocument(marker, JSON.stringify({ version: 2 }));
      return draft.finish();
    };
    if (this.project.update) await this.project.update(build, { userEdit: false });
    else await this.project.publish(build(this.project.projectPackage), undefined, undefined, undefined, { userEdit: false });
  }

  async save(document: PlanningDocument, transactionId?: string, resetWater = false): Promise<void> {
    const pack = this.project.projectPackage;
    const defaults =
      (resetWater || Boolean(planningSourceDocument(pack))) && needsWaterDefaults(pack, document, resetWater)
        ? await loadPlanningWaterDefaults()
        : undefined;
    const authoring = JSON.stringify(exportPlanningAuthoring(document));
    const build = (pack: RuntimeProjectSession["projectPackage"]) => {
      if (resetWater || planningSourceDocument(pack)) {
        const draft = new RuntimeProjectEdit(pack, new Map([...nativeAssetFormats(() => ({})), ...this.formats]));
        if (resetWater) clearPlanningWaterSource(draft, true);
        if (defaults) installPlanningWaterDefaults(draft, defaults);
        writePlanningProjectSource(draft, pack.project.scene, document);
        return draft.finish();
      }
      const existing = pack.project.files.find(
        (file) => file.virtualPath === PLANNING_PROJECT_PATH
      );
      if (
        existing &&
        (existing.virtualPath !== PLANNING_PROJECT_PATH ||
          existing.type !== PLANNING_PROJECT_TYPE)
      ) {
        throw new Error("Planning project asset identity conflicts with an existing asset");
      }
      return {
        ...pack,
        project: {
          ...pack.project,
          files: existing
            ? [...pack.project.files]
            : [
                ...pack.project.files,
                {
                  virtualPath: PLANNING_PROJECT_PATH,
                  path: "runtime-world:planning",
                  type: PLANNING_PROJECT_TYPE
                }
              ]
        },
        contents: { ...pack.contents, [PLANNING_PROJECT_PATH]: authoring }
      };
    };
    if (transactionId) await this.project.publish(build(this.project.projectPackage), this.project.publicationRevision,
      [], { transactionId });
    else if (this.project.update) await this.project.update(build);
    else await this.project.publish(build(this.project.projectPackage));
  }
}

function needsWaterDefaults(
  pack: RuntimeProjectSession["projectPackage"],
  document: PlanningDocument,
  resetWater = false
): boolean {
  const existing = new Set(pack.project.files.map((file) => file.virtualPath));
  if (resetWater && ["lake", "river", "ocean"].some((kind) => !existing.has(`Water/Materials/${kind}.mat`))) {
    return true;
  }
  return exportPlanningScene(document).refs.some(
    (ref) => /^Water\/Materials\/(lake|river|ocean)\.mat$/.test(ref.url) && !existing.has(ref.url)
  );
}
