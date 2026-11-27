import type * as dat from "dat.gui";
import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import { FARMING_DEBUG_ACTIONS, type PlanningFarmingControls } from "./PlanningFarmingControls.ts";
import { MAX_GROWTH_MULTIPLIER } from "@galacean/engine-farming/farming/config/FarmingSimulationConfig";

/** View only: the debug session owns selection, logs, transactions and canvas input. */
export class PlanningFarmingPanel {
  readonly element: HTMLElement;
  private readonly folder: dat.GUI;
  private readonly abort = new AbortController();
  private readonly observer: MutationObserver;
  private readonly unsubscribe: () => void;
  private readonly plot: HTMLSelectElement;
  private readonly seed: HTMLSelectElement;
  private readonly enabled: dat.GUIController;
  private readonly retrySwitch: HTMLButtonElement;
  private readonly picking: dat.GUIController;
  private readonly travel: HTMLButtonElement;
  private readonly damage: HTMLButtonElement;
  private readonly actions: HTMLButtonElement[];
  private readonly growth: dat.GUIController[];
  private readonly write: Record<string, (text: string) => void> = {};
  private readonly values = new Map<string, string>();
  private listSignature = "";
  private seedSignature = "";
  private disposed = false;
  private rendering = false;

  constructor(
    private readonly host: DebugInspectorPanelHost,
    private readonly controls: PlanningFarmingControls
  ) {
    const folder = (this.folder = host.folder("种植", false));
    this.element = folder.domElement;
    this.element.id = "farming-runtime-controls";
    this.element.setAttribute("aria-label", "种植调试");
    this.element.dataset.farmPanel = "";
    const readout = (parent: dat.GUI, key: string, label: string) => {
      this.write[key] = host.addReadout(parent, label, `farming-${key}`);
      this.element.querySelector<HTMLElement>(`#farming-${key}`)!.setAttribute(`data-farm-${key}`, "");
    };
    this.enabled = folder.add(controls.state, "enabled").name("开启农场")
      .onChange((value: boolean) => void controls.setEnabled(value));
    const enabledInput = this.enabled.domElement.querySelector("input")!;
    enabledInput.setAttribute("aria-label", "开启农场");
    enabledInput.dataset.farmEnabled = "";
    this.retrySwitch = host.addAction(folder, "重试农场切换", () => void controls.setEnabled(controls.state.enabled));
    this.retrySwitch.dataset.farmRetrySwitch = "";
    host.addReadout(folder, "诊断开关")("默认开启。关闭卸载农场运行、交互和渲染；保留项目存档。仅当前会话有效。");
    readout(folder, "status", "运行状态");
    readout(folder, "environment", "农业环境");
    this.travel = host.addAction(folder, "前往农场", () => controls.travel());
    this.travel.dataset.farmTravel = "";
    const growth = host.subfolder(folder, "生长调试", true);
    this.growth = (
      [
        ["cropGrowthMultiplier", "作物生长倍数"]
      ] as const
    ).map(([key, label]) => {
      const controller = growth
        .add(controls.state, key, 0, MAX_GROWTH_MULTIPLIER, 0.1)
        .name(label)
        .onFinishChange((value: number) => void controls.setGrowthMultiplier(key, value));
      const input = controller.domElement.querySelector("input")!;
      input.setAttribute("aria-label", label);
      input.dataset.farmGrowth = key;
      return controller;
    });
    host.addReadout(
      growth,
      "说明"
    )("1 倍为正常速度，0 倍暂停对应生长；只影响成长，不加速水分或昼夜。当前会话有效，重新加载后恢复 1 倍。");
    const operation = host.subfolder(folder, "耕地与操作", true);
    const plots = operation
      .add(controls.state, "plotId", { 未选择: "" })
      .name("耕地")
      .onChange((id: string) => controls.selectPlot(id));
    this.plot = plots.domElement.querySelector("select")!;
    this.plot.setAttribute("aria-label", "耕地");
    this.plot.dataset.farmPlot = "";
    const seeds = operation
      .add(controls.state, "seedId", Object.fromEntries(controls.seeds.map((s) => [s.name, s.id])))
      .name("种子");
    this.seed = seeds.domElement.querySelector("select")!;
    this.seed.setAttribute("aria-label", "种子");
    this.seed.dataset.farmSeed = "";
    this.picking = operation
      .add(controls.state, "picking")
      .name("点击选地")
      .onChange((value: boolean) => controls.setPicking(value));
    this.picking.domElement.querySelector("input")!.setAttribute("aria-label", "点击选地");
    readout(operation, "selection", "当前选择");
    host.addReadout(
      operation,
      "选地说明"
    )("开启：点击选择 8 米内的地块。关闭：随视角选择。列表选择会开启点击选地；Esc 或收起面板恢复视角选地。");
    this.actions = FARMING_DEBUG_ACTIONS.map(([id, label]) => {
      const button = host.addAction(operation, label, () => void controls.execute(id));
      button.dataset.farmAction = id;
      return button;
    });
    const actionRow = this.actions[0].parentElement!;
    Object.assign(actionRow.style, { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px" });
    actionRow.setAttribute("role", "group");
    actionRow.setAttribute("aria-label", "种植操作");
    for (const button of this.actions) {
      const row = button.parentElement!;
      Object.assign(button.style, { minHeight: "30px", padding: "3px 6px", lineHeight: "20px", margin: "0" });
      if (row !== actionRow) {
        actionRow.append(button);
        row.remove();
      }
    }
    operation.add(controls.state, "damagePermille").name("伤害（正整数千分值）");
    this.damage = host.addAction(operation, "对选中作物施加伤害", () => void controls.damageCrop());
    this.damage.dataset.farmDamage = "";
    readout(operation, "message", "操作结果");
    const message = this.element.querySelector<HTMLElement>("[data-farm-message]")!;
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    readout(host.subfolder(folder, "当前耕地", true), "selected-status", "耕地状态");
    readout(host.subfolder(folder, "仓储", false), "inventory", "收获物");
    readout(host.subfolder(folder, "农场诊断", false), "diagnostics", "检查结果");
    const logs = host.subfolder(folder, "全局种植日志", false);
    host.addAction(logs, "清空日志", () => controls.activity.clear()).dataset.farmClear = "";
    readout(logs, "log", "最近 100 条");
    const log = this.element.querySelector<HTMLElement>("#farming-log")!;
    log.setAttribute("role", "log");
    log.setAttribute("aria-label", "全局种植日志");
    log.tabIndex = 0;
    log.style.maxHeight = "240px";
    log.style.overflow = "auto";
    log.style.userSelect = "text";
    for (const event of ["keydown", "keyup", "pointerdown", "pointerup", "click", "wheel"])
      this.element.addEventListener(event, (e) => e.stopPropagation(), { signal: this.abort.signal });
    this.unsubscribe = controls.subscribe(() => this.render());
    this.observer = new MutationObserver(() => this.syncVisibility());
    // dat.gui folders, category switching and the root close button all update ancestor attributes.
    for (let node: HTMLElement | null = this.element; node; node = node.parentElement)
      this.observer.observe(node, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
    const list = this.element.querySelector(":scope > ul");
    if (list) this.observer.observe(list, { attributes: true, attributeFilter: ["class"] });
    this.refresh();
    host.refreshLayout();
  }

  private syncVisibility(): void {
    if (this.disposed) return;
    let visible = this.element.isConnected && !this.folder.closed;
    for (let node: HTMLElement | null = this.element; visible && node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.classList.contains("closed") || style.display === "none" || style.visibility === "hidden")
        visible = false;
    }
    this.controls.setVisible(visible);
  }
  refresh(): void {
    if (this.disposed) return;
    this.syncVisibility();
    void this.controls.refresh();
    this.render();
  }
  private render(): void {
    if (this.disposed || this.rendering) return;
    this.rendering = true;
    try {
      const c = this.controls;
      this.retrySwitch.hidden = !c.switchError;
      this.retrySwitch.disabled = c.toggling;
      this.enabled.updateDisplay();
      this.enabled.domElement.querySelector<HTMLInputElement>("input")!.disabled = c.toggling;
      const signature = JSON.stringify(c.plots);
      if (signature !== this.listSignature) {
        this.plot.replaceChildren(
          new Option("未选择 / 选中地面", ""),
          ...c.plots.map((p) => new Option(p.label, p.plotId))
        );
        this.listSignature = signature;
        this.host.refreshLayout();
      }
      this.plot.value = c.state.plotId;
      this.plot.disabled = c.busy || !c.plots.length;
      const seedSignature = JSON.stringify(c.seeds);
      if (seedSignature !== this.seedSignature) {
        this.seed.replaceChildren(...c.seeds.map((seed) => new Option(seed.name, seed.id)));
        this.seedSignature = seedSignature;
      }
      this.seed.value = c.state.seedId;
      this.seed.disabled = c.busy || !c.seeds.length;
      this.damage.disabled = c.busy || !c.active;
      for (const controller of this.growth) {
        const input = controller.domElement.querySelector<HTMLInputElement>("input")!;
        if (document.activeElement !== input) controller.updateDisplay();
        input.disabled = c.busy || !c.active;
        controller.domElement.style.pointerEvents = c.busy || !c.active ? "none" : "";
      }
      this.picking.updateDisplay();
      this.picking.domElement.querySelector<HTMLInputElement>("input")!.disabled = c.busy || !c.active;
      this.travel.disabled = !!c.travelReason || c.busy;
      this.travel.title = c.travelReason;
      this.actions.forEach((button, i) => {
        const available = c.availability.find((a) => a.action === FARMING_DEBUG_ACTIONS[i][0]);
        button.disabled = c.busy || !c.active;
        button.title = c.busy
          ? "操作进行中"
          : (available?.reason ?? (available?.enabled ? "" : "请先选择可操作的耕地或地面"));
      });
      const values: Record<string, string> = {
        status: c.status,
        environment: c.environment,
        message: c.message || "暂无操作",
        selection: c.selectionLabel,
        "selected-status": c.selectedStatus,
        inventory: c.inventory,
        diagnostics: c.diagnostics,
        log:
          [...c.activity.entries]
            .reverse()
            .map((e) => `[${new Date(e.time).toLocaleTimeString("zh-CN", { hour12: false })}] ${e.message}`)
            .join("\n") || "暂无记录，操作结果和所有耕地的成熟事件会显示在这里。"
      };
      let changed = false;
      for (const [key, value] of Object.entries(values))
        if (this.values.get(key) !== value) {
          this.values.set(key, value);
          this.write[key](value);
          changed = true;
        }
      if (changed) this.host.refreshLayout();
    } finally {
      this.rendering = false;
    }
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.abort.abort();
    this.unsubscribe();
    this.controls.setVisible(false);
    this.host.gui.removeFolder(this.folder);
  }
}
