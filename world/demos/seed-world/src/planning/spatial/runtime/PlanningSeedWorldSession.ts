import { SeedWorldPlanningService } from "../../../../agent-adapter/SeedWorldPlanningService.ts";
import { beginSeedWorldProjectEdit } from "../../../../agent-adapter/SeedWorldProjectEdit.ts";
import { useProjectPlantResources } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import { invalidatePlanningPopulationResources } from "@galacean/engine-world-planning/spatial/runtime/PlanningPopulationRuntime";
import type { AgentEditorExtension } from "@galacean/engine-ai-chat/ai-chat/agent-extensions";
import { planningPickAssets } from "@galacean/engine-world-planning/spatial/runtime/PlanningWorldPicking";
import type { ProjectFileProvider } from "@galacean/engine-project/project-files/virtual-project-files";
import { planningResourceSnapshot } from "@galacean/engine-world-planning/spatial/PlanningResources";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { planningVegetationCatalog, planningVegetationObjects } from "./PlanningVegetationCatalog.ts";
import { planningEditablePlants } from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetation";
import { planningGroundSurface } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import type { PlanningNaturalVegetationRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetationRuntime";
import type { Camera, Engine, Entity } from "@galacean/engine";
import type { OrbitControl } from "@galacean/engine-toolkit-controls";
import type { WorldEnvironmentRuntime } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import type { TerrainLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import type { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import { mountSeedWorldChatPanel, type SeedWorldChatPanel } from "../../../../assistant/SeedWorldChatPanel.ts";
import { SeedWorldAgentApplication } from "../../../../agent-adapter/SeedWorldAgentApplication.ts";
import { SeedWorldRuntimeEnginePort } from "../../../../agent-adapter/runtime/SeedWorldRuntimeEnginePort.ts";
import { planningSolidObjects } from "./PlanningObjectCatalog.ts";
import type {
  SeedWorldMountCommandInput,
  SeedWorldMountCommandResult
} from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { sampleSeedWorldHeight, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { SeedWorldRuntimePlan } from "@galacean/engine-world-planning/world/SeedWorldRuntimePlan";
import type { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import type { SeedWorldSurfaceMaterialIntent } from "@galacean/engine-world-planning/runtime/SeedWorldSurfaceIntent";
import type { PlanningEditOptions } from "@galacean/engine-world-planning/spatial/hydrology/PlanningWaterEdits";
import type { PlanningParameterCommand, PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import type { PlanningWaterRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterRuntime";
import type { SeedWorldAnimalService } from "../../../../agent-adapter/ports/SeedWorldAnimalService.ts";

declare global {
  interface Window {
    seedWorldAI?: SeedWorldChatPanel;
    seedWorldAIError?: string;
    seedWorldPlanning?: PlanningSeedWorldSession["parameterDebug"];
  }
}

/** Real published scene input. A pending planner draft must never be returned here. */
export interface PlanningSeedWorldPublished {
  readonly vegetation?: PlanningNaturalVegetationRuntime;
  readonly plan: SeedWorldRuntimePlan;
  readonly fields: SeedWorldFields;
  readonly world: SeedWorldTerrainRuntime;
  readonly surface: SeedWorldSurfaceMaterialIntent;
  readonly publicationRevision?: number;
  readonly sourcePlan?: IslandPlan;
}
export interface PlanningSeedWorldSessionOptions {
  readonly observeViewWithPointer?: import("../../../../assistant/SeedWorldChatPanel.ts").SeedWorldChatPanelOptions["observeViewWithPointer"];
  readonly animals?: SeedWorldAnimalService;
  readonly editorExtensions?: readonly AgentEditorExtension[];
  readonly nativeEditor?: RuntimeNativeEditor;
  readonly projectFiles?: readonly ProjectFileProvider[];
  readonly querySubjectCapsules?: NonNullable<import("@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort").SeedWorldEnginePort["querySubjectCapsules"]>;
  readonly querySubjectSegments?: NonNullable<import("@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort").SeedWorldEnginePort["querySubjectSegments"]>;
  readonly planning: PlanningSession;
  readonly engine: Engine;
  readonly root: Entity;
  readonly camera: Camera;
  readonly navigation: TerrainNavigationRuntime;
  readonly orbit: OrbitControl;
  readonly lighting: TerrainLightingRuntime;
  readonly environment: WorldEnvironmentRuntime;
  readonly water: PlanningWaterRuntime;
  readonly readPublished: () => PlanningSeedWorldPublished | undefined;
  readonly setWorldInputEnabled: (enabled: boolean) => void;
  readonly isActive: () => boolean;
  /** Persist the accepted document and publish its native scene before resolving. */
  readonly onParametersChanged?: () => Promise<void>;
  readonly initiallyOpen?: boolean;
  readonly traceEnabled?: boolean;
}

/** Original Seed HUD and Agent share one published scene and one parameter authority. */
export class PlanningSeedWorldSession {
  private readonly planningService: SeedWorldPlanningService;
  readonly port: SeedWorldRuntimeEnginePort;
  readonly application: SeedWorldAgentApplication;
  private panel?: SeedWorldChatPanel;
  private disposed = false;
  private readonly authoringLifetime = new AbortController();
  private async moveHistory(direction: "undo" | "redo") {
    const editor = this.options.nativeEditor;
    if (!editor) throw new Error("Project editor is not mounted");
    const signal = new AbortController().signal, edit = editor.beginEdit(crypto.randomUUID(), signal);
    try {
      const entry = edit.history()[direction][0];
      if (!entry) throw new Error(`No transaction to ${direction}`);
      await edit.moveHistory({direction, transactionIds: [entry.transactionId]});
      await edit.prepare(signal); const receipt = await edit.commit(); await edit.activate(signal); return receipt;
    } finally { edit.discard(); }
  }
  /** Development console forwards the existing validated component commands, never generated arrays. */
  readonly parameterDebug = Object.freeze({
    sampleWater: (x:number,z:number,id?:string) => this.options.water.system.sample(x,z,id),
    sampleDrops: (x:number,y:number,z:number,id?:string) => this.options.water.system.sampleDrops(x,y,z,id),
    publishedWater: () => ({revision:this.options.water.system.revision,bodies:this.options.water.system.bodies.map(b=>this.options.water.system.inspect(b.waterId))}),
    undo: () => this.moveHistory("undo"),
    redo: () => this.moveHistory("redo"),
    describe: () => this.describeParameters(),
    query: (filter: Parameters<PlanningSession["query"]>[0] = {}) => this.queryElements(filter),
    inspect: (id: string) => this.inspectElement(id),
    createWater: async (input: Parameters<PlanningSession["createWater"]>[0], expectedRevision?: number) => {
      return this.editPlanning(session => session.createWater(input, expectedRevision));
    },
    removeWater: async (id:string,expectedRevision?:number) => {
      return this.editPlanning(session => session.removeWater(id, expectedRevision));
    },
    dispatch: (commands: PlanningParameterCommand[], expectedRevision?: number, options?: PlanningEditOptions) =>
      this.dispatchParameters(commands, expectedRevision, options)
  });

  constructor(private readonly options: PlanningSeedWorldSessionOptions) {
    this.planningService = new SeedWorldPlanningService(options.planning, () => {
      if (this.disposed || !options.isActive() || !options.readPublished())
        throw new Error("Seed World is not published");
    }, references => {
      useProjectPlantResources(options.engine, references);
      invalidatePlanningPopulationResources(options.engine);
    });
    const unsupported = (): never => {
      throw new Error(
        "NOT_SUPPORTED: 此空间规划工程仅支持组件参数修改；旧版实体增删、笔刷和撤销未映射到 PlanningSession，未执行修改。"
      );
    };
    this.port = new SeedWorldRuntimeEnginePort({
      readAdditionalObjects: revision => {
        const published = options.readPublished(), plan = published?.sourcePlan;
        return published && plan ? [...planningSolidObjects(plan, revision), ...(published.vegetation
          ? planningVegetationObjects(published.vegetation.getAuthoringSnapshot(), revision) : [])] : [];
      },
      querySubjectSegments:options.querySubjectSegments,
      querySubjectCapsules:options.querySubjectCapsules,
      readContext: () => {
        const published = options.readPublished();
        if (this.disposed || !published || !options.isActive()) return null;
        return {
          ...published,
          cameraMode: "roam",
          camera: options.camera,
          navigation: options.navigation,
          orbit: options.orbit,
          lighting: options.lighting,
          environment: options.environment,
          water: options.water
        };
      },
      readVegetationAssets: () => {
        const runtime = options.readPublished()?.vegetation;
        return runtime ? planningVegetationCatalog(runtime) : undefined;
      },
      isDestroyed: () => this.disposed,
      sampleNavigationHeight: (_plan, fields, x, z) => sampleSeedWorldHeight(fields, x, z),
      commandMount: (input, signal) => this.commandMount(input, signal),
      queryWaterRegions: (kind, limit) => options.water.queryRegions(kind, limit),
      resolveWaterColorBodyId: (ref) => options.water.resolveColorBodyId(ref),
      readAuthoringSnapshot: () => planningResourceSnapshot(options.planning.document),
      mutateWorldResource: unsupported,
      mutateWorldResources: unsupported,
    });
    this.application = new SeedWorldAgentApplication(this.port, this.planningService, () => {
      const plan = options.readPublished()?.sourcePlan;
      return plan ? planningPickAssets(plan) : [];
    }, this.parameterAuthoring(options.planning), { nativeCatalog: (plan, revision) => {
      const runtime = options.readPublished()?.vegetation;
      if (!runtime) return undefined;
      const snapshot = { trees: planningEditablePlants(plan, planningGroundSurface(plan), runtime.plantAssets),
        authoredPlantIds: (plan.authoredResources ?? []).filter(resource => resource.resourceType === "vegetation-brush" &&
          resource.properties.distributionKind === "single" && ["tree", "shrub"].includes(resource.properties.category)).map(resource => resource.resourceId),
        flowers: plan.flowerRegions ?? [], seed: plan.parameters.seed };
      return { assets: planningVegetationCatalog({ getAuthoringSnapshot: () => snapshot }),
        objects: planningVegetationObjects(snapshot, revision) };
    } }, options.animals);
  }

  private parameterAuthoring(session: PlanningSession): import("../../../../agent-adapter/tools/parameter-tools.ts").SeedWorldParameterAuthoring {
    return {
      forSession: draft => this.parameterAuthoring(draft),
      describe: component => session.describe().filter(item => !component || item.type === component),
      query: filter => session.query(filter),
      inspect: id => ({ ...session.inspect(id), versionToken: String(session.document.revision) }),
      apply: async (commands, token, signal) => {
        signal.throwIfAborted();
        if (!/^(0|[1-9]\d*)$/.test(token) || !Number.isSafeInteger(Number(token))) throw new Error("Invalid versionToken");
        const receipt = await (session === this.options.planning
          ? this.dispatchParameters(commands, Number(token))
          : session.dispatchParameters(commands, Number(token)));
        return { ...receipt, versionToken: String(receipt.revision) };
      }
    };
  }

  get assistant(): SeedWorldChatPanel | undefined {
    return this.panel;
  }
  get listening(): boolean {
    return this.panel?.listening ?? false;
  }

  /** Mounts the original Galacean UI panel, with its real Agent and speech lifecycle. */
  show(): void {
    if (this.disposed) throw new Error("Seed World session has been disposed");
    if (!this.options.readPublished() || !this.options.isActive()) throw new Error("Seed World is not published");
    this.panel ??= mountSeedWorldChatPanel({
      observeViewWithPointer: this.options.observeViewWithPointer,
      nativeEditor: this.options.nativeEditor, projectFiles: this.options.projectFiles,
      application: this.application,
      editorExtensions: this.options.editorExtensions,
      engine: this.options.engine,
      root: this.options.root,
      camera: this.options.camera,
      setWorldInputEnabled: this.options.setWorldInputEnabled,
      initiallyOpen: this.options.initiallyOpen,
      traceEnabled: this.options.traceEnabled
    });
    if (typeof window !== "undefined") {
      window.seedWorldAI = this.panel;
      window.seedWorldAIError = undefined;
      if (import.meta.env.DEV) window.seedWorldPlanning = this.parameterDebug;
    }
    this.panel.show();
  }
  hide(): void {
    this.panel?.hide();
  }

  /** Authoring always crosses the same validated component boundary as the planning inspector. */
  async dispatchParameters(commands: PlanningParameterCommand[], expectedRevision?: number, options?: PlanningEditOptions) {
    if (this.disposed) throw new Error("Seed World session has been disposed");
    return this.editPlanning(session => session.dispatchParameters(commands, expectedRevision, options));
  }
  private async editPlanning(operation: (session: PlanningSession) => Promise<import("@galacean/engine-world-planning/spatial/PlanningSession").EditReceipt>) {
    if (this.disposed) throw new Error("Seed World session has been disposed");
    const editor = this.options.nativeEditor;
    if (!editor) throw new Error("Project editor is not mounted");
    const signal = this.authoringLifetime.signal;
    const edit = beginSeedWorldProjectEdit(this.application, editor, crypto.randomUUID(), signal);
    try {
      const receipt = await edit.runPlanning(operation);
      if (receipt.status !== "accepted") return receipt;
      await edit.prepare(signal);
      await edit.commit();
      await edit.activate(signal);
      return receipt;
    } finally { edit.discard(); }
  }
  describeParameters() {
    return this.options.planning.describe();
  }
  queryElements(filter: Parameters<PlanningSession["query"]>[0] = {}) {
    return this.options.planning.query(filter);
  }
  inspectElement(id: string) {
    return this.options.planning.inspect(id);
  }

  /** Compatibility port rejects removed legacy horse commands; current tool discovery does not expose them. */
  async commandMount(
    _input: Readonly<SeedWorldMountCommandInput>,
    signal: AbortSignal
  ): Promise<SeedWorldMountCommandResult> {
    signal.throwIfAborted();
    throw new Error("NOT_SUPPORTED: 当前动物注册没有骑乘能力，旧马入口已移除。");
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.authoringLifetime.abort(new Error("Seed World session disposed"));
    if (typeof window !== "undefined" && window.seedWorldAI === this.panel) window.seedWorldAI = undefined;
    if (typeof window !== "undefined" && window.seedWorldPlanning === this.parameterDebug)
      window.seedWorldPlanning = undefined;
    this.panel?.session.dispose();
    this.panel?.destroy();
    this.panel = undefined;
  }
}
