import type * as dat from "dat.gui";
import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import type { PlanningDocument } from "../../../spatial/PlanningDocument.ts";
import type { PlanningParameterCommand } from "../../../spatial/PlanningSession.ts";
import { ROCK_FORMATION_COMPONENT, ROCK_OBB_COMPONENT, readRockFormationSettings } from "./Settings.ts";
import { DEFAULT_ROCK_HEIGHT_MODE, type RockSurfaceMode } from "@galacean/engine-terrain/rock-formation/types";
import { rockObbId } from "./Authoring.ts";
import { automaticSlopeRate, DEFAULT_ROCK_SLOPE_VARIATION } from "@galacean/engine-terrain/rock-formation/Slope";
import { ROCK_COLOR_FIELD_KEYS } from "./ColorPalette.ts";
import { RockColorControls } from "./ColorControls.ts";
import { ROCK_GENERATION_COMPONENT, readRockGenerationProfile, rockGenerationKind } from "./GenerationProfile.ts";

/** Shared detail settings and individual OBB surface, height, slope and dimension authoring. */
export class RockFormationPanel {
  readonly element: HTMLElement;
  private readonly folder: dat.GUI;
  private readonly obbFolder: dat.GUI;
  private readonly colors: RockColorControls;
  private readonly abort = new AbortController();
  private readonly fields = new Map<
    string,
    { control: HTMLInputElement | HTMLSelectElement; controller: dat.GUIController }
  >();
  private readonly draft: Record<string, string> = {};
  private readonly generationDraft: Record<string, string> = {};
  private readonly generationFields = new Map<string, { input: HTMLInputElement; controller: dat.GUIController }>();
  private readonly writeGeneration: (value: string) => void;
  private readonly sizes = { width: "", height: "", depth: "" };
  private readonly sizeControllers = new Map<string, dat.GUIController>();
  private readonly selection = { id: "" };
  private readonly select: HTMLSelectElement;
  private readonly obbDraft = {
    heightMode: "inherit" as typeof DEFAULT_ROCK_HEIGHT_MODE | "inherit",
    surfaceMode: "inherit" as RockSurfaceMode | "inherit",
    automaticSlope: true,
    slopeRate: "",
    slopeVariation: String(DEFAULT_ROCK_SLOPE_VARIATION)
  };
  private readonly topDraft = { heightVariation: "0.2" };
  private readonly heightVariationController: dat.GUIController;
  private readonly heightVariationInput: HTMLInputElement;
  private readonly heightModeController: dat.GUIController;
  private readonly heightModeSelect: HTMLSelectElement;
  private readonly surfaceModeController: dat.GUIController;
  private readonly surfaceModeSelect: HTMLSelectElement;
  private readonly slopeModeController: dat.GUIController;
  private readonly slopeModeInput: HTMLInputElement;
  private readonly slopeRateController: dat.GUIController;
  private readonly slopeRateInput: HTMLInputElement;
  private readonly slopeVariationController: dat.GUIController;
  private readonly slopeVariationInput: HTMLInputElement;
  private readonly writeSlope: (value: string) => void;
  private publishedSize: readonly number[] = [1, 1, 1];
  private manualSlopeRate?: string;
  private slopeRateEdited = false;
  private readonly writeObbSurface: (value: string) => void;
  private readonly writeSurface: (value: string) => void;
  private readonly writeStatus: (value: string) => void;
  private plan?: IslandPlan;
  private document?: PlanningDocument;
  private busy = false;
  private disposed = false;
  private frame?: number;
  private writeGrass?: (value: string) => void;

  constructor(
    private readonly host: DebugInspectorPanelHost,
    private readonly apply: (commands: PlanningParameterCommand[]) => Promise<unknown>,
    private readonly grass?: { preview(enabled: boolean): void; diagnostics(): string }
  ) {
    this.folder = host.folder("Rock formation / 岩石形态", false);
    this.element = this.folder.domElement;
    this.element.setAttribute("aria-label", "Rock formation controls / 岩石形态参数");
    this.writeSurface = host.addReadout(this.folder, "Default surface / 默认表面");
    const generation = host.subfolder(this.folder, "Generation profile / 生成配置", false);
    for (const field of ROCK_GENERATION_COMPONENT.fields) {
      this.generationDraft[field.key] = String(field.default);
      const controller = generation
        .add(this.generationDraft, field.key)
        .name(`${field.label}${field.unit ? ` (${field.unit})` : ""}`);
      const input = controller.domElement.querySelector("input")!;
      input.type = "number";
      input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      input.step = String(field.step);
      input.dataset.generationField = field.key;
      input.setAttribute("aria-label", field.label);
      this.generationFields.set(field.key, { input, controller });
    }
    host.addReadout(
      generation,
      "Profile guide / 配置说明"
    )(
      "Platforms use steep random ascent; peaks use Perlin and automatic slopes. Share is a per-OBB probability. Height scales the original tier height; individual overrides win. / 平台使用陡坡随机上升，山峰使用 Perlin 与自动坡率。比例为逐 OBB 概率；高度倍率作用于原始等级高度，单体覆盖优先。"
    );
    host.addAction(generation, "Apply generation profile / 应用生成配置", () => {
      if (!this.document) return;
      const current = readRockGenerationProfile(this.document),
        values: Record<string, number> = {};
      for (const [key, { input }] of this.generationFields)
        if (Number(input.value) !== current[key as keyof typeof current]) values[key] = Number(input.value);
      if (Object.keys(values).length)
        void this.submit([{ op: "set", entity: "world", component: "rockGeneration", values }]);
    }).dataset.generationApply = "";
    host.addAction(
      generation,
      "Reset generation profile / 重置生成配置",
      () => void this.submit([{ op: "reset", entity: "world", component: "rockGeneration" }])
    ).dataset.generationReset = "";
    if (grass) {
      const debug = { coverage: false };
      this.folder
        .add(debug, "coverage")
        .name("Grass coverage preview / 草地覆盖预览")
        .onChange((value) => grass.preview(Boolean(value)));
      this.writeGrass = host.addReadout(this.folder, "Rock grass / 岩面草地");
      host.addReadout(
        this.folder,
        "Coverage guide / 覆盖说明"
      )(
        "Green shows surface suitability; roots also require support and free space. / 绿色为表面适宜度，草根仍需通过支撑与占用检查。"
      );
      this.refreshGrass();
    }
    const sharedFolders = new Map<string, dat.GUI>();
    for (const field of ROCK_FORMATION_COMPONENT.fields) {
      if (ROCK_COLOR_FIELD_KEYS.has(field.key)) continue;
      this.draft[field.key] = String(field.default ?? "");
      const title =
        field.key === "surfaceMode"
          ? undefined
          : field.key === "textureScale"
            ? "Shared material / 共用材质"
            : field.key.startsWith("slab")
              ? "Shared slabs / 共用岩层参数"
              : field.key.startsWith("cell")
                ? "Shared curvature / 共用曲率参数"
                : "Shared Perlin / 共用 Perlin 参数";
      let folder = this.folder;
      if (title) {
        folder = sharedFolders.get(title) ?? host.subfolder(this.folder, title, false);
        sharedFolders.set(title, folder);
      }
      // String-backed numeric controllers leave validation to the authoring schema.
      const controller = field.options
        ? folder.add(
            this.draft,
            field.key,
            Object.fromEntries(field.options.map((value) => [field.optionLabels?.[value] ?? value, value]))
          )
        : folder.add(this.draft, field.key);
      controller.name(field.label);
      const control = controller.domElement.querySelector<HTMLInputElement | HTMLSelectElement>("input,select")!;
      if (control instanceof HTMLInputElement) {
        control.type = "number";
        if (field.min !== undefined) control.min = String(field.min);
        if (field.max !== undefined) control.max = String(field.max);
        control.step = String(field.step ?? "any");
      } else controller.onChange(() => this.refreshSurfaceFields());
      control.dataset.field = field.key;
      control.setAttribute("aria-label", field.label);
      this.fields.set(field.key, { control, controller });
    }
    host.addReadout(
      sharedFolders.get("Shared material / 共用材质")!,
      "Texture size guide / 纹理尺寸说明"
    )(
      "Shared by vertex-defined slabs and cellular curvature. Smaller values give finer detail; updates material without rebuilding rocks. / 顶点岩层与蜂窝曲率共用。数值越小，纹理越细；应用时仅更新材质，不重建岩石。"
    );
    this.colors = new RockColorControls(host, sharedFolders.get("Shared material / 共用材质")!, (commands) =>
      this.submit(commands)
    );
    host.addAction(this.folder, "Apply formation settings / 应用形态设置", () => {
      if (!this.document) return;
      const current = this.flatSettings(readRockFormationSettings(this.document)),
        values: Record<string, string | number> = {};
      for (const [key, { control }] of this.fields) {
        const value = control instanceof HTMLSelectElement ? control.value : Number(control.value);
        if (value !== current[key]) values[key] = value;
      }
      if (Object.keys(values).length)
        void this.submit([{ op: "set", entity: "world", component: "rockFormation", values }]);
    }).dataset.rockApply = "";
    host.addAction(
      this.folder,
      "Reset formation / 重置形态",
      () => void this.submit([{ op: "reset", entity: "world", component: "rockFormation" }])
    ).dataset.rockReset = "";
    this.obbFolder = host.subfolder(this.folder, "Individual OBB / 独立包围盒", true);
    this.writeGeneration = host.addReadout(this.obbFolder, "Seeded form / 种子形态");
    const selectionController = this.obbFolder
      .add(this.selection, "id", { "No rock OBBs / 暂无岩石包围盒": "" })
      .name("Rock OBB / 岩石包围盒")
      .onChange(() => this.refreshObb());
    this.select = selectionController.domElement.querySelector("select")!;
    this.select.setAttribute("aria-label", "Rock OBB / 岩石包围盒");
    const heightMode = ROCK_OBB_COMPONENT.fields.find((field) => field.key === "heightMode")!;
    this.heightModeController = this.obbFolder
      .add(this.obbDraft, "heightMode", {
        "Inherit profile / 继承生成配置": "inherit",
        ...Object.fromEntries(heightMode.options!.map((value) => [heightMode.optionLabels?.[value] ?? value, value]))
      })
      .name(heightMode.label);
    this.heightModeSelect = this.heightModeController.domElement.querySelector("select")!;
    this.heightModeSelect.setAttribute("aria-label", "OBB height mode / 包围盒高度模式");
    this.heightModeSelect.dataset.obbHeightMode = "";
    host.addReadout(
      this.obbFolder,
      "Height guide / 高度说明"
    )(
      "Random ascent uses the ascent shape directly. Perlin noise shapes it with the shared noise settings. / 随机上升直接使用上升形态；Perlin 模式使用共用噪声参数塑造该形态。"
    );
    const surfaceMode = ROCK_OBB_COMPONENT.fields.find((field) => field.key === "surfaceMode")!;
    this.surfaceModeController = this.obbFolder
      .add(this.obbDraft, "surfaceMode", {
        "Inherit surface / 继承表面": "inherit",
        ...Object.fromEntries(surfaceMode.options!.map((value) => [surfaceMode.optionLabels?.[value] ?? value, value]))
      })
      .name(surfaceMode.label);
    this.surfaceModeSelect = this.surfaceModeController.domElement.querySelector("select")!;
    this.surfaceModeSelect.setAttribute("aria-label", "OBB rock surface / 包围盒岩石表面");
    this.surfaceModeSelect.dataset.obbSurfaceMode = "";
    this.writeObbSurface = host.addReadout(this.obbFolder, "Current surface / 当前表面");
    host.addReadout(
      this.obbFolder,
      "Surface inheritance / 表面继承说明"
    )(
      "Inherit follows the linked parameter source, otherwise the formation default. Detail settings above are shared. / 继承所链接的参数来源；无来源时使用默认表面。上方细节参数由所有包围盒共用。"
    );
    for (const key of ["width", "height", "depth"] as const) {
      const label = ROCK_OBB_COMPONENT.fields.find((field) => field.key === key)!.label;
      const controller = this.obbFolder.add(this.sizes, key).name(`${label} (m)`);
      const input = controller.domElement.querySelector("input")!;
      input.type = "number";
      input.min = "0.1";
      input.max = "2048";
      input.step = "0.5";
      input.dataset.size = key;
      input.setAttribute("aria-label", `${label} (m)`);
      input.addEventListener("input", () => this.refreshSlopeFields(), { signal: this.abort.signal });
      this.sizeControllers.set(key, controller);
    }
    this.slopeModeController = this.obbFolder
      .add(this.obbDraft, "automaticSlope")
      .name("Auto slope / 自动坡率")
      .onChange(() => {
        // Choosing manual explicitly fixes the displayed base; later size edits must not recalculate it.
        if (!this.slopeModeInput.checked && this.manualSlopeRate === undefined) {
          this.manualSlopeRate = this.slopeRateInput.value;
          this.slopeRateEdited = true;
        }
        this.refreshSlopeFields();
      });
    this.slopeModeInput = this.slopeModeController.domElement.querySelector("input")!;
    this.slopeModeInput.setAttribute("aria-label", "Automatic slope from OBB size / 按包围盒尺寸自动计算坡率");
    this.slopeModeInput.dataset.obbSlopeMode = "";
    this.slopeRateController = this.obbFolder
      .add(this.obbDraft, "slopeRate")
      .name("Manual base slope / 手动基础坡率 (m/m)");
    this.slopeRateInput = this.slopeRateController.domElement.querySelector("input")!;
    this.slopeRateInput.type = "number";
    this.slopeRateInput.min = "0";
    this.slopeRateInput.step = "any";
    this.slopeRateInput.setAttribute("aria-label", "OBB manual base slope / 包围盒手动基础坡率");
    this.slopeRateInput.dataset.obbSlopeRate = "";
    this.slopeRateInput.addEventListener(
      "input",
      () => {
        this.manualSlopeRate = this.slopeRateInput.value;
        this.slopeRateEdited = true;
        this.refreshSlopeFields();
      },
      { signal: this.abort.signal }
    );
    this.slopeVariationController = this.obbFolder
      .add(this.obbDraft, "slopeVariation")
      .name("Slope variation / 坡率变化 (0–1)");
    this.slopeVariationInput = this.slopeVariationController.domElement.querySelector("input")!;
    this.slopeVariationInput.type = "number";
    this.slopeVariationInput.min = "0";
    this.slopeVariationInput.max = "1";
    this.slopeVariationInput.step = "0.05";
    this.slopeVariationInput.setAttribute("aria-label", "OBB slope variation / 包围盒坡率变化");
    this.slopeVariationInput.dataset.obbSlopeVariation = "";
    this.heightVariationController = this.obbFolder
      .add(this.topDraft, "heightVariation")
      .name("Top height variation / 顶部高度变化 (0–1)");
    this.heightVariationInput = this.heightVariationController.domElement.querySelector("input")!;
    this.heightVariationInput.type = "number";
    this.heightVariationInput.min = "0";
    this.heightVariationInput.max = "1";
    this.heightVariationInput.step = "0.01";
    this.heightVariationInput.dataset.obbHeightVariation = "";
    this.heightVariationInput.setAttribute("aria-label", "Top height variation / 顶部高度变化");
    this.writeSlope = host.addReadout(this.obbFolder, "Base slope / 基础坡率");
    host.addReadout(
      this.obbFolder,
      "Slope guide / 坡率说明"
    )(
      "Automatic base = height ÷ half the shorter footprint side. Variation affects this OBB's steepness, faces and height in both height modes. / 自动基础坡率 = 高度 ÷ 较短底边的一半。变化量影响当前包围盒的陡峭程度、岩面和高度，对两种高度模式均生效。"
    );
    host.addAction(this.obbFolder, "Apply OBB settings / 应用包围盒设置", () => {
      if (!this.select.value) return;
      const commands: PlanningParameterCommand[] = [];
      const values: Record<string, string | number> = Object.fromEntries(
        Array.from(this.element.querySelectorAll<HTMLInputElement>("[data-size]"))
          .filter((input) => input.value !== input.dataset.displayed)
          .map((input) => [input.dataset.size!, Number(input.value)])
      );
      if (this.heightModeSelect.value !== this.heightModeSelect.dataset.displayed) {
        if (this.heightModeSelect.value === "inherit")
          commands.push({ op: "reset", entity: this.select.value, component: "rockObb", fields: ["heightMode"] });
        else values.heightMode = this.heightModeSelect.value;
      }
      if (this.surfaceModeSelect.value !== this.surfaceModeSelect.dataset.displayed) {
        if (this.surfaceModeSelect.value === "inherit")
          commands.push({ op: "reset", entity: this.select.value, component: "rockObb", fields: ["surfaceMode"] });
        else values.surfaceMode = this.surfaceModeSelect.value;
      }
      const slopeMode = this.slopeModeInput.checked ? "auto" : "manual";
      if (slopeMode !== this.slopeModeInput.dataset.displayed) values.slopeMode = slopeMode;
      // Only direct rate edits or choosing manual author the displayed fallback.
      if (this.slopeRateEdited) values.slopeRate = Number(this.manualSlopeRate);
      if (this.slopeVariationInput.value !== this.slopeVariationInput.dataset.displayed)
        values.slopeVariation = Number(this.slopeVariationInput.value);
      if (this.heightVariationInput.value !== this.heightVariationInput.dataset.displayed)
        values.heightVariation = Number(this.heightVariationInput.value);
      if (Object.keys(values).length)
        commands.push({ op: "set", entity: this.select.value, component: "rockObb", values });
      if (commands.length) void this.submit(commands);
    }).dataset.obbApply = "";
    host.addAction(this.obbFolder, "Reset OBB / 重置包围盒", () => {
      if (this.select.value) void this.submit([{ op: "reset", entity: this.select.value, component: "rockObb" }]);
    }).dataset.obbReset = "";
    this.writeStatus = host.addReadout(this.folder, "Edit status / 编辑状态", "rock-formation-edit-status");
    this.element.querySelector("#rock-formation-edit-status")!.setAttribute("role", "status");
    for (const event of ["keydown", "keyup", "pointerdown", "pointerup", "wheel"])
      this.element.addEventListener(event, (event) => event.stopPropagation(), { signal: this.abort.signal });
    this.refreshSurfaceFields();
  }
  refreshGrass(): void {
    if (this.grass) this.writeGrass?.(this.grass.diagnostics());
  }

  synchronize(plan: IslandPlan, document: PlanningDocument): void {
    if (this.disposed) return;
    this.plan = plan;
    this.document = document;
    const generation = readRockGenerationProfile(document);
    for (const [key, { input, controller }] of this.generationFields) {
      this.generationDraft[key] = String(generation[key as keyof typeof generation]);
      controller.updateDisplay();
      input.value = this.generationDraft[key];
    }
    const selected = this.select.value;
    this.select.replaceChildren();
    const groups = new Map<string, number>(),
      counts = new Map<string, number>();
    for (const rock of plan.rocks)
      for (const box of rock.boxes ?? [{ id: rock.id }]) {
        const option = window.document.createElement("option");
        option.value = rockObbId(rock.id, box.id);
        if (!groups.has(rock.groupId)) groups.set(rock.groupId, groups.size + 1);
        const number = (counts.get(rock.groupId) ?? 0) + 1;
        counts.set(rock.groupId, number);
        option.textContent = `Formation / 岩体 ${groups.get(rock.groupId)} · OBB / 包围盒 ${number}`;
        option.title = box.id;
        this.select.append(option);
      }
    if (Array.from(this.select.options).some((option) => option.value === selected)) this.select.value = selected;
    this.selection.id = this.select.value;
    const values = this.flatSettings(readRockFormationSettings(document));
    this.colors.synchronize(readRockFormationSettings(document).colorBlend);
    for (const [key, { control, controller }] of this.fields) {
      this.draft[key] = String(values[key]);
      controller.updateDisplay();
      // dat.gui skips focused controls; an accepted publication is authoritative.
      control.value = this.draft[key];
    }
    this.refreshSurfaceFields();
    this.refreshObb();
    this.setDisabled(this.busy);
  }
  private flatSettings(settings: ReturnType<typeof readRockFormationSettings>): Record<string, string | number> {
    return {
      surfaceMode: settings.surfaceMode,
      textureScale: settings.textureScale,
      noiseSeed: settings.perlin.seed,
      frequency: settings.perlin.frequency,
      octaves: settings.perlin.octaves,
      lacunarity: settings.perlin.lacunarity,
      persistence: settings.perlin.persistence,
      maskPower: settings.perlin.maskPower,
      slabSeed: settings.slabs.seed,
      slabSize: settings.slabs.size,
      slabCoverage: settings.slabs.coverage,
      slabDepth: settings.slabs.depth,
      slabVariation: settings.slabs.variation,
      cellSize: settings.curvature.cellSize,
      cellInset: settings.curvature.inset,
      cellDepth: settings.curvature.depth,
      cellDetail: settings.curvature.detail,
      cellCoverage: settings.curvature.coverage
    };
  }
  private refreshSurfaceFields(): void {
    const curved = this.fields.get("surfaceMode")!.control.value === "cellular-curvature";
    this.writeSurface(
      curved
        ? "Original painted rock · cellular edge shading / 原始绘制岩石·蜂窝边缘着色"
        : "Vertex-defined slabs / 顶点定义岩层"
    );
    this.host.refreshLayout();
  }
  private refreshObb(): void {
    for (const rock of this.plan?.rocks ?? [])
      for (const box of rock.boxes ?? [
        {
          id: rock.id,
          sizeX: rock.width,
          sizeY: rock.height,
          sizeZ: rock.depth,
          heightMode: DEFAULT_ROCK_HEIGHT_MODE,
          surfaceMode: undefined,
          slopeMode: undefined,
          slopeRate: undefined,
          slopeVariation: undefined,
          heightVariation: undefined
        }
      ]) {
        if (rockObbId(rock.id, box.id) !== this.select.value) continue;
        const profile = readRockGenerationProfile(this.document!);
        const kind = rockGenerationKind(this.plan!.parameters.seed, this.select.value, profile);
        this.writeGeneration(
          `${kind === "platform" ? "Platform / 平台" : "Peak / 山峰"} · ${
            (box.heightMode ?? DEFAULT_ROCK_HEIGHT_MODE) === "random-ascent"
              ? "Random ascent / 随机上升"
              : "Perlin ascent / Perlin 上升"
          }`
        );
        const ownHeightMode = this.document?.entities[this.select.value]?.components.rockObb?.values.heightMode;
        this.obbDraft.heightMode = (ownHeightMode as typeof DEFAULT_ROCK_HEIGHT_MODE | undefined) ?? "inherit";
        this.heightModeController.updateDisplay();
        this.heightModeSelect.value = this.obbDraft.heightMode;
        this.heightModeSelect.dataset.displayed = this.heightModeSelect.value;
        const ownSurface = this.document?.entities[this.select.value]?.components.rockObb?.values.surfaceMode;
        this.obbDraft.surfaceMode = (ownSurface as RockSurfaceMode | undefined) ?? "inherit";
        this.surfaceModeController.updateDisplay();
        this.surfaceModeSelect.value = this.obbDraft.surfaceMode;
        this.surfaceModeSelect.dataset.displayed = this.surfaceModeSelect.value;
        const effectiveSurface = box.surfaceMode ?? readRockFormationSettings(this.document!).surfaceMode;
        this.writeObbSurface(
          effectiveSurface === "cellular-curvature"
            ? "Cellular curvature · rock faces / 蜂窝曲率·岩面"
            : "Vertex-defined slabs / 顶点定义岩层"
        );
        this.publishedSize = [box.sizeX, box.sizeY, box.sizeZ];
        for (const [key, value] of [
          ["width", box.sizeX],
          ["height", box.sizeY],
          ["depth", box.sizeZ]
        ] as const) {
          this.sizes[key] = String(Number(value.toFixed(2)));
          this.sizeControllers.get(key)!.updateDisplay();
          const input = this.element.querySelector<HTMLInputElement>(`[data-size="${key}"]`)!;
          input.value = this.sizes[key];
          input.dataset.displayed = input.value;
        }
        this.obbDraft.automaticSlope = (box.slopeMode ?? "auto") === "auto";
        this.slopeModeController.updateDisplay();
        this.slopeModeInput.checked = this.obbDraft.automaticSlope;
        this.slopeModeInput.dataset.displayed = this.obbDraft.automaticSlope ? "auto" : "manual";
        this.manualSlopeRate = box.slopeRate === undefined ? undefined : String(box.slopeRate);
        this.slopeRateEdited = false;
        this.obbDraft.slopeVariation = String(box.slopeVariation ?? DEFAULT_ROCK_SLOPE_VARIATION);
        this.slopeVariationController.updateDisplay();
        this.slopeVariationInput.value = this.obbDraft.slopeVariation;
        this.slopeVariationInput.dataset.displayed = this.slopeVariationInput.value;
        this.topDraft.heightVariation = String(box.heightVariation ?? 0.2);
        this.heightVariationController.updateDisplay();
        this.heightVariationInput.value = this.topDraft.heightVariation;
        this.heightVariationInput.dataset.displayed = this.heightVariationInput.value;
        this.refreshSlopeFields();
      }
  }
  private refreshSlopeFields(): void {
    const size = (["width", "height", "depth"] as const).map((key, index) => {
      const input = this.element.querySelector<HTMLInputElement>(`[data-size="${key}"]`)!;
      return input.value === input.dataset.displayed ? this.publishedSize[index] : Number(input.value);
    });
    const automatic = this.slopeModeInput.checked;
    const rate = size.every((value) => Number.isFinite(value) && value > 0) ? automaticSlopeRate(size) : undefined;
    this.obbDraft.slopeRate =
      !automatic && this.manualSlopeRate !== undefined ? this.manualSlopeRate : String(rate ?? "");
    this.slopeRateController.updateDisplay();
    this.slopeRateInput.value = this.obbDraft.slopeRate;
    this.slopeRateInput.disabled = this.busy || !this.select.options.length || automatic;
    const base = Number(this.obbDraft.slopeRate);
    this.writeSlope(
      Number.isFinite(base) && base > 0
        ? `${automatic ? "Automatic / 自动" : "Manual / 手动"} · ${Number(base.toFixed(4))} m/m · Before variation / 应用变化前`
        : "Enter positive OBB dimensions and a positive base slope. / 包围盒尺寸和基础坡率须为正数。"
    );
    this.host.refreshLayout();
  }
  /** GPU picking and the OBB selector address the same authored box identity. */
  selectObb(id: string): boolean {
    if (this.disposed || this.busy || !Array.from(this.select.options).some((option) => option.value === id))
      return false;
    this.selection.id = id;
    this.select.value = id;
    this.refreshObb();
    for (const folder of [this.host.gui, this.folder, this.obbFolder]) {
      folder.open();
      // Native pointer toggles update these, but programmatic picking bypasses them.
      const title = folder.domElement.querySelector<HTMLElement>(".title");
      title?.classList.remove("is-collapsed");
      title?.setAttribute("aria-expanded", "true");
    }
    this.host.refreshLayout();
    return true;
  }
  private setDisabled(disabled: boolean): void {
    for (const control of this.element.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
      "input,select,button"
    ))
      control.disabled = disabled;
    this.slopeRateInput.disabled = disabled || this.slopeModeInput.checked;
    if (!this.select.options.length) {
      this.select.disabled = true;
      for (const control of this.obbFolder.domElement.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLButtonElement
      >("input,select,button"))
        control.disabled = true;
    }
  }
  private async submit(commands: PlanningParameterCommand[]): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true;
    const started = performance.now();
    let lastFrame = started,
      maxFrameGapMs = 0,
      frames = 0;
    const observeFrame = () => {
      const now = performance.now();
      maxFrameGapMs = Math.max(maxFrameGapMs, now - lastFrame);
      lastFrame = now;
      frames++;
      this.frame = requestAnimationFrame(observeFrame);
    };
    this.frame = requestAnimationFrame(observeFrame);
    this.writeStatus("Preparing rocks… / 正在生成岩石…");
    this.setDisabled(true);
    try {
      const receipt = (await this.apply(commands)) as { status?: string };
      if (!this.disposed)
        this.writeStatus(
          receipt?.status === "accepted"
            ? "Applied / 已应用"
            : `Edit result / 编辑结果：${receipt?.status ?? "Finished / 已完成"}`
        );
    } catch (error) {
      if (!this.disposed) this.writeStatus(String(error));
    } finally {
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
      this.frame = undefined;
      const now = performance.now();
      this.element.dataset.editTiming = JSON.stringify({
        totalMs: now - started,
        frames,
        maxFrameGapMs: Math.max(maxFrameGapMs, now - lastFrame)
      });
      this.busy = false;
      if (!this.disposed) {
        this.setDisabled(false);
        this.host.refreshLayout();
      }
    }
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.host.gui.removeFolder(this.folder);
    this.host.refreshLayout();
  }
}
