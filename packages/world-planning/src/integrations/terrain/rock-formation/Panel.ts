import type * as dat from "dat.gui";
import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import type { PlanningDocument } from "../../../spatial/PlanningDocument.ts";
import type { PlanningParameterCommand } from "../../../spatial/PlanningSession.ts";
import { ROCK_FORMATION_COMPONENT, ROCK_OBB_COMPONENT, readRockFormationSettings } from "./Settings.ts";
import { rockObbId } from "./Authoring.ts";
import { ROCK_COLOR_FIELD_KEYS } from "./ColorPalette.ts";
import { RockColorControls } from "./ColorControls.ts";

type NumberControl = { input: HTMLInputElement; controller: dat.GUIController };

/** Shared procedural-shape settings and published OBB dimensions, through authoring transactions. */
export class RockFormationPanel {
  readonly element: HTMLElement;
  private readonly folder: dat.GUI;
  private readonly obbFolder: dat.GUI;
  private readonly colors: RockColorControls;
  private readonly abort = new AbortController();
  private readonly fields = new Map<string, NumberControl>();
  private readonly sizes = new Map<string, NumberControl>();
  private readonly draft: Record<string, string> = {};
  private readonly sizeDraft: Record<string, string> = {};
  private readonly selection = { id: "" };
  private readonly select: HTMLSelectElement;
  private readonly writeStatus: (value: string) => void;
  private writeGrass?: (value: string) => void;
  private plan?: IslandPlan;
  private document?: PlanningDocument;
  private busy = false;
  private disposed = false;

  constructor(
    private readonly host: DebugInspectorPanelHost,
    private readonly apply: (commands: PlanningParameterCommand[]) => Promise<unknown>,
    private readonly grass?: { preview(enabled: boolean): void; diagnostics(): string }
  ) {
    this.folder = host.folder("Rock formation / 岩石形态", false);
    this.element = this.folder.domElement;
    this.element.setAttribute("aria-label", "Rock formation controls / 岩石形态参数");
    const shape = host.subfolder(this.folder, "Shape / 整体轮廓与岩壁", true);
    const material = host.subfolder(this.folder, "Shared material / 共用材质", false);
    const sampling = host.subfolder(this.folder, "Sampling / 变化与精简", false);
    for (const field of ROCK_FORMATION_COMPONENT.fields) {
      if (ROCK_COLOR_FIELD_KEYS.has(field.key)) continue;
      const folder =
        field.key === "textureScale" ? material : ["variation", "simplifyError"].includes(field.key) ? sampling : shape;
      this.draft[field.key] = String(field.default ?? "");
      const controller = folder.add(this.draft, field.key).name(field.label);
      const input = controller.domElement.querySelector("input")!;
      input.type = "number";
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      input.step = String(field.step ?? "any");
      input.dataset.field = field.key;
      input.setAttribute("aria-label", field.label);
      this.fields.set(field.key, { input, controller });
    }
    host.addReadout(material, "Texture repeat / 平铺规则")("0：每块石头使用 OBB 最长边 ÷ 2 米；正数：统一平铺米数。");
    this.colors = new RockColorControls(host, material, (commands) => this.submit(commands));
    host.addAction(this.folder, "Apply formation settings / 应用形态设置", () => {
      if (!this.document) return;
      const current = this.flatSettings(readRockFormationSettings(this.document));
      const values = Object.fromEntries(
        [...this.fields].flatMap(([key, { input }]) =>
          Number(input.value) === current[key] ? [] : [[key, Number(input.value)]]
        )
      );
      if (Object.keys(values).length)
        void this.submit([{ op: "set", entity: "world", component: "rockFormation", values }]);
    }).dataset.rockApply = "";
    host.addAction(
      this.folder,
      "Reset formation / 重置形态",
      () => void this.submit([{ op: "reset", entity: "world", component: "rockFormation" }])
    ).dataset.rockReset = "";
    this.obbFolder = host.subfolder(this.folder, "Individual OBB / 独立包围盒", true);
    const selected = this.obbFolder
      .add(this.selection, "id", { "No rock OBBs / 暂无岩石包围盒": "" })
      .name("Rock OBB / 岩石包围盒")
      .onChange(() => this.refreshObb());
    this.select = selected.domElement.querySelector("select")!;
    this.select.setAttribute("aria-label", "Rock OBB / 岩石包围盒");
    for (const field of ROCK_OBB_COMPONENT.fields) {
      this.sizeDraft[field.key] = "";
      const controller = this.obbFolder.add(this.sizeDraft, field.key).name(`${field.label} (m)`);
      const input = controller.domElement.querySelector("input")!;
      input.type = "number";
      input.min = ".1";
      input.step = ".5";
      input.dataset.size = field.key;
      input.setAttribute("aria-label", field.label);
      this.sizes.set(field.key, { input, controller });
    }
    host.addAction(this.obbFolder, "Apply OBB settings / 应用包围盒设置", () => {
      if (!this.select.value) return;
      const values = Object.fromEntries(
        [...this.sizes].flatMap(([key, { input }]) =>
          input.value === input.dataset.displayed ? [] : [[key, Number(input.value)]]
        )
      );
      if (Object.keys(values).length)
        void this.submit([{ op: "set", entity: this.select.value, component: "rockObb", values }]);
    }).dataset.obbApply = "";
    host.addAction(this.obbFolder, "Reset OBB / 重置包围盒", () => {
      if (this.select.value) void this.submit([{ op: "reset", entity: this.select.value, component: "rockObb" }]);
    }).dataset.obbReset = "";
    if (grass) {
      this.folder
        .add({ coverage: false }, "coverage")
        .name("Grass coverage / 草地覆盖预览")
        .onChange((value) => grass.preview(Boolean(value)));
      this.writeGrass = host.addReadout(this.folder, "Rock grass / 岩面草地");
      this.refreshGrass();
    }
    this.writeStatus = host.addReadout(this.folder, "Edit status / 编辑状态", "rock-formation-edit-status");
    this.element.querySelector("#rock-formation-edit-status")!.setAttribute("role", "status");
    for (const event of ["keydown", "keyup", "pointerdown", "pointerup", "wheel"])
      this.element.addEventListener(event, (event) => event.stopPropagation(), { signal: this.abort.signal });
  }
  refreshGrass(): void {
    if (this.grass) this.writeGrass?.(this.grass.diagnostics());
  }

  synchronize(plan: IslandPlan, document: PlanningDocument): void {
    if (this.disposed) return;
    this.plan = plan;
    this.document = document;
    const selected = this.select.value;
    this.select.replaceChildren();
    for (const rock of plan.rocks)
      for (const box of rock.boxes ?? [{ id: rock.id }]) {
        const option = window.document.createElement("option");
        option.value = rockObbId(rock.id, box.id);
        option.textContent = box.id;
        this.select.append(option);
      }
    if ([...this.select.options].some((option) => option.value === selected)) this.select.value = selected;
    this.selection.id = this.select.value;
    const settings = readRockFormationSettings(document),
      values = this.flatSettings(settings);
    this.colors.synchronize(settings.colorBlend);
    for (const [key, { input, controller }] of this.fields) {
      this.draft[key] = String(values[key]);
      controller.updateDisplay();
      input.value = this.draft[key];
    }
    this.refreshObb();
    this.setDisabled(this.busy);
  }
  private flatSettings(settings: ReturnType<typeof readRockFormationSettings>): Record<string, number> {
    return {
      ...settings.shape,
      variation: settings.variation,
      simplifyError: settings.simplifyError,
      textureScale: settings.textureScale
    };
  }
  private refreshObb(): void {
    for (const rock of this.plan?.rocks ?? [])
      for (const box of rock.boxes ?? [
        {
          id: rock.id,
          sizeX: rock.width,
          sizeY: rock.height,
          sizeZ: rock.depth
        }
      ]) {
        if (rockObbId(rock.id, box.id) !== this.select.value) continue;
        for (const [key, value] of [
          ["width", box.sizeX],
          ["height", box.sizeY],
          ["depth", box.sizeZ]
        ] as const) {
          const { input, controller } = this.sizes.get(key)!;
          this.sizeDraft[key] = String(Number(value.toFixed(2)));
          controller.updateDisplay();
          input.value = this.sizeDraft[key];
          input.dataset.displayed = input.value;
        }
      }
    this.host.refreshLayout();
  }
  /** GPU picking and the selector address the same authored box identity. */
  selectObb(id: string): boolean {
    if (this.disposed || this.busy || ![...this.select.options].some((option) => option.value === id)) return false;
    this.selection.id = id;
    this.select.value = id;
    this.refreshObb();
    for (const folder of [this.host.gui, this.folder, this.obbFolder]) {
      folder.open();
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
    if (!this.select.options.length)
      for (const control of this.obbFolder.domElement.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLButtonElement
      >("input,select,button"))
        control.disabled = true;
  }
  private async submit(commands: PlanningParameterCommand[]): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true;
    this.setDisabled(true);
    this.writeStatus("正在生成岩石…");
    try {
      const receipt = (await this.apply(commands)) as { status?: string };
      if (!this.disposed)
        this.writeStatus(receipt.status === "accepted" ? "已应用" : `编辑结果：${receipt.status ?? "已完成"}`);
    } catch (error) {
      if (!this.disposed) this.writeStatus(String(error));
    } finally {
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
    this.host.gui.removeFolder(this.folder);
    this.host.refreshLayout();
  }
}
