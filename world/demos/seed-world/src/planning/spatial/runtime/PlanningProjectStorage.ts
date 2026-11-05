import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { exportPlanningAuthoring, exportPlanningRecipe, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { planningSeed } from "@galacean/engine-world-planning/spatial/PlanningLayoutScope";
import { parsePlanningDocument } from "../PlanningDocumentCodec.ts";
import { RuntimeProjectEdit, type RuntimeAssetFormat } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { planningSourceDocument, writePlanningProjectSource } from "./PlanningProjectSource.ts";
import { initializePlanningWater, initializePlanningOcean, installPlanningWaterDefaults, loadPlanningWaterDefaults } from "./PlanningWaterInitialization.ts";
import type { SemanticResult } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";

export const PLANNING_PROJECT_PATH = "World/Planning.json";
export const PLANNING_PROJECT_TYPE = "SeedWorldPlanning";

/** Project asset is the sole source of persisted planning state. */
export class PlanningProjectStorage {
  constructor(
    private readonly project: Pick<RuntimeProjectSession, "projectPackage" | "publish"> &
      Partial<Pick<RuntimeProjectSession, "update" | "publicationRevision">>,
    private readonly formats: ReadonlyMap<string, RuntimeAssetFormat> = new Map()
  ) {}

  /** New Source authoring baseline is ready before the first Engine Scene load. */
  async initialize(document: PlanningDocument, result: SemanticResult): Promise<PlanningDocument> {
    const defaults = await loadPlanningWaterDefaults();
    const build = (pack: RuntimeProjectSession["projectPackage"]) => {
      const draft = new RuntimeProjectEdit(pack, new Map([...nativeAssetFormats(() => ({})), ...this.formats]));
      installPlanningWaterDefaults(draft, defaults);
      const next = initializePlanningWater(draft, document, result.plan);
      writePlanningProjectSource(draft, pack.project.scene, next);
      initializePlanningOcean(draft, result.plan);
      draft.writeDocument(`${pack.project.scene}.planning-source.json`, JSON.stringify({ version: 1 }));
      return draft.finish();
    };
    if (this.project.update) await this.project.update(build);
    else await this.project.publish(build(this.project.projectPackage));
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

  /** Import the saved envelope once, before loading the production Scene. */
  async migrateToSource(document: PlanningDocument): Promise<void> {
    const build = (pack: RuntimeProjectSession["projectPackage"]) => {
      const marker = `${pack.project.scene}.planning-source.json`;
      if (pack.documents?.[marker] !== undefined) {
        if (JSON.parse(pack.documents[marker]).version !== 1) throw new Error("Unsupported planning Source migration");
        return pack;
      }
      const draft = new RuntimeProjectEdit(pack, new Map([...nativeAssetFormats(() => ({})), ...this.formats]));
      writePlanningProjectSource(draft, pack.project.scene, document);
      if (draft.list().some(file => file.virtualPath === PLANNING_PROJECT_PATH)) draft.delete(PLANNING_PROJECT_PATH);
      draft.writeDocument(marker, JSON.stringify({ version: 1 }));
      return draft.finish();
    };
    if (this.project.update) await this.project.update(build);
    else await this.project.publish(build(this.project.projectPackage));
  }

  async save(document: PlanningDocument, transactionId?: string): Promise<void> {
    const authoring = JSON.stringify(exportPlanningAuthoring(document));
    const build = (pack: RuntimeProjectSession["projectPackage"]) => {
      if (planningSourceDocument(pack)) {
        const draft = new RuntimeProjectEdit(pack, new Map([...nativeAssetFormats(() => ({})), ...this.formats]));
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
