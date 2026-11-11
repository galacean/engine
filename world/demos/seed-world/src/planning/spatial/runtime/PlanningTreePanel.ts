import type * as dat from "dat.gui";
import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import {
  addHdrColorControl,
  createHdrColorState,
  synchronizeHdrColor,
  type HdrColorState,
  type LinearRgb
} from "@galacean/engine-world-planning/integrations/terrain/debug/HdrColorControl";
import {
  PlanningTreeAuthoring,
  TREE_MATERIAL_FIELDS,
  treeMaterialValues,
  plantLandscapeControls,
  type PlanningTreeSnapshot,
  type PlanningTreeChange,
  type TreeMaterialValues
} from "./PlanningTreeAuthoring";

/** Selection and expansion survive the normal replacement of a published World. */
export interface PlanningTreePanelState {
  assetId?: string;
  slotId?: string;
  categoryOpen?: boolean;
  open?: boolean;
  folders?: Record<string, boolean>;
}

export interface PlanningPlantPanelOptions {
  layers?: readonly string[];
  title?: string;
  speciesLabel?: string;
  materialLabel?: string;
  colorLabel?: string;
}

/** Authoring controls for the real catalog, material slots and component parameters. */
export class PlanningTreePanel {
  readonly element: HTMLElement;
  private readonly folder: dat.GUI;
  private content?: dat.GUI;
  private readonly groups = new Map<string, dat.GUI>();
  private readonly writeStatus: (value: string) => void;
  private readonly unsubscribe: () => void;
  private snapshot?: PlanningTreeSnapshot;
  private loading = false;
  private attemptedRevision = -1;
  private disposed = false;
  private selected = { assetId: "", slotId: "" };
  private values: TreeMaterialValues = {};
  private readonly hdrColors = new Map<string, HdrColorState>();
  private shape = { scaleX: 1, scaleY: 1, scaleZ: 1, yawDegrees: 0, leafSize: 1, leafDensity: 1, woodThickness: 1 };
  private landscape: Record<string, number> = {};

  constructor(
    private readonly host: DebugInspectorPanelHost,
    private readonly authoring: PlanningTreeAuthoring,
    private readonly state: PlanningTreePanelState,
    private readonly options: PlanningPlantPanelOptions = {}
  ) {
    this.folder = host.folder(options.title ?? "Tree appearance / 树木外观", state.open ?? true);
    this.element = this.folder.domElement;
    this.element.setAttribute("aria-label", options.title ?? "树木配色与外观参数");
    this.element.dataset.treeAuthoringPanel = "";
    host.addReadout(
      this.folder,
      "编辑范围"
    )("颜色与材质实时预览，使用保存按钮写入工程。形态与分布使用各自的应用按钮。");
    this.writeStatus = host.addReadout(this.folder, "编辑状态");
    this.unsubscribe = authoring.subscribe(() => {
      if (this.disposed) return;
      this.writeStatus(authoring.status);
      this.disable(authoring.busy);
      if (!authoring.busy) void this.reload();
    });
    void this.reload();
  }

  /** Poll only the accepted project revision; no runtime writes or per-frame asset reads. */
  refresh(): void {
    if (
      !this.disposed &&
      !this.loading &&
      !this.authoring.busy &&
      (this.snapshot?.revision ?? this.attemptedRevision) !== this.authoring.options.project.publicationRevision
    )
      void this.reload();
  }
  destroy(): void {
    if (this.disposed) return;
    this.capture();
    this.state.open = !this.folder.closed;
    this.state.categoryOpen = !this.host.gui.closed;
    this.disposed = true;
    this.unsubscribe();
    this.host.gui.removeFolder(this.folder);
  }
  private capture(): void {
    this.state.assetId = this.selected.assetId || this.state.assetId;
    this.state.slotId = this.selected.slotId || this.state.slotId;
    this.state.folders = Object.fromEntries([...this.groups].map(([key, folder]) => [key, !folder.closed]));
  }
  private group(name: string, parent = this.content!): dat.GUI {
    const group = this.host.subfolder(parent, name, this.state.folders?.[name] ?? name === "颜色与层次");
    this.groups.set(name, group);
    return group;
  }
  private hdrColor(key: string, color: LinearRgb): HdrColorState {
    const id = JSON.stringify([this.selected.assetId, this.selected.slotId, key]);
    let state = this.hdrColors.get(id);
    if (state) synchronizeHdrColor(state, color);
    else {
      state = createHdrColorState(color);
      this.hdrColors.set(id, state);
    }
    return state;
  }
  private numeric(
    folder: dat.GUI,
    target: Record<string, number> | TreeMaterialValues,
    key: string,
    label: string,
    min?: number,
    max?: number,
    preview?: (value: number) => void
  ): dat.GUIController {
    const controller = folder.add(target, key).name(label);
    const input = controller.domElement.querySelector("input")!;
    input.type = "number";
    input.step = "any";
    if (min !== undefined) input.min = String(min);
    if (max !== undefined) input.max = String(max);
    input.setAttribute("aria-label", label);
    input.dataset.treeField = key;
    // dat.gui guesses display precision from the initial value. Native number
    // inputs keep the complete authored number, including values typed before blur.
    const update = controller.updateDisplay.bind(controller);
    controller.updateDisplay = () => {
      update();
      input.value = String(controller.getValue());
      return controller;
    };
    input.addEventListener("input", () => {
      if (input.value.trim() && Number.isFinite(input.valueAsNumber)) {
        target[key] = input.valueAsNumber;
        preview?.(input.valueAsNumber);
      }
    });
    if (preview) controller.onChange(preview);
    controller.updateDisplay();
    return controller;
  }
  private async reload(): Promise<void> {
    if (this.loading || this.disposed) return;
    this.loading = true;
    this.attemptedRevision = this.authoring.options.project.publicationRevision;
    this.disable(true);
    try {
      const snapshot = await this.authoring.snapshot(this.selected.assetId || this.state.assetId, this.options.layers);
      if (this.disposed) return;
      if (this.content) this.capture();
      this.snapshot = snapshot;
      this.selected.assetId = snapshot.assetId;
      this.selected.slotId = snapshot.slots.some((slot) => slot.id === (this.selected.slotId || this.state.slotId))
        ? this.selected.slotId || this.state.slotId!
        : (snapshot.slots.find((slot) => slot.part !== "bark")?.id ?? snapshot.slots[0].id);
      this.build(snapshot);
      this.writeStatus(this.authoring.status || "颜色与材质实时调节");
    } catch (error) {
      if (!this.disposed) this.writeStatus(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading = false;
      if (!this.disposed) this.disable(this.authoring.busy);
    }
  }
  private build(snapshot: PlanningTreeSnapshot): void {
    if (this.content) this.folder.removeFolder(this.content);
    this.groups.clear();
    this.content = this.host.subfolder(this.folder, "Species & parameters / 物种与参数", true);
    const species = this.content
      .add(this.selected, "assetId", Object.fromEntries(snapshot.species.map((entry) => [entry.label, entry.id])))
      .name(this.options.speciesLabel ?? "Tree species / 树种")
      .onChange(() => {
        this.selected.slotId = "";
        void this.reload();
      });
    species.domElement.querySelector("select")?.setAttribute("aria-label", this.options.speciesLabel ?? "树种");
    const slots = this.content
      .add(this.selected, "slotId", Object.fromEntries(snapshot.slots.map((slot) => [slot.label, slot.id])))
      .name("Material slot / 材质部位")
      .onChange(() => {
        void this.reload();
      });
    slots.domElement.querySelector("select")?.setAttribute("aria-label", this.options.materialLabel ?? "树木材质部位");
    const slot = snapshot.slots.find((slot) => slot.id === this.selected.slotId)!;
    this.host.addReadout(
      this.content,
      "材质作用范围"
    )(
      slot.sharedSlotCount > 1
        ? `此原生材质由 ${slot.sharedSlotCount} 个植物槽共用；表面参数同步影响这些槽。基础配色只修改当前物种和部位。`
        : "基础配色和表面参数作用于当前物种与部位。"
    );
    this.values = treeMaterialValues(slot.material);
    const colors = this.group("颜色与层次");
    addHdrColorControl(
      colors,
      this.hdrColor("baseColor", slot.baseColor),
      "Base color / 基础色",
      (color) => this.previewAppearance(snapshot, slot.id, { baseColor: color }),
      this.options.colorLabel ?? "树木基础色"
    );
    for (const field of TREE_MATERIAL_FIELDS) {
      if (slot.part === "bark" && !["smoothness", "normalStrength"].includes(field.key)) continue;
      if ("requires" in field && !slot.material.macros.some((macro) => macro.name === field.requires)) continue;
      if (
        ["secondColorOffset", "secondColorFade"].includes(field.key) &&
        slot.material.macros.some((macro) => macro.name === "MATERIAL_SECOND_COLOR_LINEAR_OBJECT_GRADIENT")
      )
        continue;
      const group = this.groups.get(field.group) ?? this.group(field.group);
      if ("color" in field) {
        const source = slot.material.shaderData[field.uniform]?.value;
        const rgb: LinearRgb = typeof source === "object" ? [source.r, source.g, source.b] : [0, 0, 0];
        addHdrColorControl(group, this.hdrColor(field.key, rgb), field.label, (color) =>
          this.previewAppearance(snapshot, slot.id, { material: { [field.key]: color } })
        );
        continue;
      }
      const preview = (value: number | string | boolean) =>
        this.previewAppearance(snapshot, slot.id, { material: { [field.key]: value } });
      const controller =
        "macro" in field || "boolean" in field
          ? group.add(this.values, field.key).name(field.label).onChange(preview)
          : this.numeric(
              group,
              this.values,
              field.key,
              field.label,
              "min" in field ? field.min : undefined,
              "max" in field ? field.max : undefined,
              preview
            );
      controller.domElement.querySelector("input")?.setAttribute("aria-label", field.label);
    }
    this.host.addAction(this.content, "Save appearance / 保存配色与材质", () => {
      void this.run(() => this.authoring.saveAppearance(snapshot, slot.id));
    }).dataset.treeAction = "appearance";
    this.host.addAction(this.content, "Reset appearance / 恢复素材配色与材质", () => {
      void this.run(() => this.apply({ resetAppearance: slot.id }));
    }).dataset.treeAction = "reset-appearance";
    if (snapshot.instanceEditable) {
      const group = this.group("树形与叶量");
      const scale = snapshot.entry.instanceScale ?? [1, 1, 1];
      const variation = snapshot.entry.instanceVariation;
      this.shape = {
        scaleX: scale[0],
        scaleY: scale[1],
        scaleZ: scale[2],
        yawDegrees: variation?.yawDegrees ?? 0,
        leafSize: variation?.leafSize ?? 1,
        leafDensity: variation?.leafDensity ?? 1,
        woodThickness: 1
      };
      for (const [key, label] of [
        ["scaleX", "横向比例 X"],
        ["scaleY", "纵向比例 Y"],
        ["scaleZ", "冠幅比例 Z"],
        ["yawDegrees", "水平旋转（度）"],
        ["leafSize", "树叶大小"],
        ["leafDensity", "树叶密度"],
        ["woodThickness", "枝干粗细倍率"]
      ] as const)
        this.numeric(
          group,
          this.shape,
          key,
          label,
          key === "leafDensity" ? 0 : key === "yawDegrees" ? undefined : Number.MIN_VALUE,
          key === "leafDensity" ? 1 : undefined
        );
      this.host.addReadout(
        group,
        "树形说明"
      )("树形按规划包围盒适配。枝干粗细倍率作用于当前结构，1 保持现状；树叶密度 0 隐藏树叶。");
      this.host.addAction(group, "Apply shape / 应用树形", () => {
        void this.run(() => this.applyShape());
      }).dataset.treeAction = "shape";
      this.host.addAction(group, "Reset shape / 恢复实例树形", () => {
        void this.run(() => this.apply({ resetShape: true }));
      }).dataset.treeAction = "reset-shape";
    }

    const distribution = this.group("所选物种所属层的密度与尺度");
    const controls = plantLandscapeControls(snapshot.layers);
    this.landscape = Object.fromEntries(
      controls.map(({key}) => [key, Number(snapshot.landscape[key])])
    );
    for (const field of controls)
      this.numeric(distribution, this.landscape, field.key, field.label, field.min, "max" in field ? field.max : undefined);
    this.host.addReadout(distribution, "作用范围")("同一功能层共享；地点和单体已有的局部覆盖继续优先。密度比例筛选候选，花区内采样密度在全局规划中调整。");
    this.host.addAction(distribution, "Apply distribution / 应用分布与高度", () => {
      void this.run(() => this.apply({ landscape: { ...this.landscape } }));
    }).dataset.treeAction = "distribution";
    this.host.addAction(distribution, "Reset distribution / 恢复分布与高度", () => {
      void this.run(() => this.apply({ landscape: null }));
    });
    this.element.dataset.treeTarget = snapshot.assetId;
    this.element.dataset.treeAuthoringReady = "true";
    this.host.refreshLayout();
    this.disable(this.authoring.busy);
  }
  private previewAppearance(
    snapshot: PlanningTreeSnapshot,
    slotId: string,
    change: Parameters<PlanningTreeAuthoring["previewAppearance"]>[2]
  ): void {
    // Switching a dat.gui select can remove the old colour input before its blur
    // callback runs. A detached controller must never write into the new target.
    if (
      this.disposed ||
      snapshot !== this.snapshot ||
      snapshot.assetId !== this.selected.assetId ||
      slotId !== this.selected.slotId
    )
      return;
    try {
      this.authoring.previewAppearance(snapshot, slotId, change);
      this.writeStatus("实时预览；尚未保存");
    } catch (error) {
      this.writeStatus(error instanceof Error ? error.message : String(error));
    }
  }
  private async applyShape(): Promise<void> {
    const { woodThickness, ...instance } = this.shape;
    await this.apply({ instance, ...(woodThickness !== 1 ? { woodThickness } : {}) });
  }
  private async apply(change: PlanningTreeChange): Promise<void> {
    if (!this.snapshot) throw new Error("正在读取树木参数");
    await this.authoring.apply(this.snapshot, change);
  }
  private disable(disabled: boolean): void {
    this.element
      .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input,select,button")
      .forEach((control) => {
        control.disabled = disabled;
      });
  }
  private async run(operation: () => Promise<void>): Promise<void> {
    if (this.disposed || this.loading || this.authoring.busy) return;
    try {
      await operation();
    } catch (error) {
      if (!this.disposed) this.writeStatus(error instanceof Error ? error.message : String(error));
    }
  }
}
