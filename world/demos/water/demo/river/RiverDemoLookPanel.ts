import type * as dat from "dat.gui";
import { validateRiverDemoLook, type RiverDemoLook } from "./RiverDemoLook.ts";

export function createRiverDemoLookPanel(
  gui: dat.GUI,
  options: {
    readLook(): RiverDemoLook;
    readLookName?(): string;
    readDefaultLook(): RiverDemoLook;
    readSurfaceTime(): number | undefined;

    applyLook(look: RiverDemoLook): Promise<void>;
    patchLook(patch: Partial<RiverDemoLook>): Promise<void>;
    exportLook(): string;
    importLook(json: string): Promise<void>;

    setSurfaceTime(time?: number): void;
    setEnvironmentEnabled(enabled: boolean): void;
  }
) {
  const editing = validateRiverDemoLook(options.readLook());
  type LookKey = keyof RiverDemoLook;
  const editVersions = new Map<LookKey, number>();
  let editVersion = 0;
  let destroyed = false;
  const refresh = (resetDraft = false) => {
    if (resetDraft) editVersions.clear();
    if (destroyed) return;
    const committed = validateRiverDemoLook(options.readLook());
    if (!editVersions.has("contactEffects")) editing.contactEffects = committed.contactEffects;
    effects.domElement.style.display = committed.contactEffects ? "" : "none";
    for (const key of Object.keys(committed) as LookKey[]) {
      // Keep both queued edits and unfinished drags when an earlier update completes.
      if (!editVersions.has(key)) Object.assign(editing, { [key]: committed[key] });
    }
    const time = options.readSurfaceTime();
    controls.frozen = time !== undefined;
    if (time !== undefined) controls.time = time;
    const update = (folder: dat.GUI) => {
      folder.__controllers.forEach((c) => c.updateDisplay());
      Object.values(folder.__folders).forEach(update);
    };
    update(gui);
  };
  const updateLook = async (keys: LookKey[], update: () => Promise<void>) => {
    const version = ++editVersion;
    keys.forEach((key) => editVersions.set(key, version));
    try {
      await update();
    } finally {
      for (const key of keys) {
        if (editVersions.get(key) === version) editVersions.delete(key);
      }
      refresh();
    }
  };
  const reportError = (error: unknown) => console.error("[river-look]", error);
  const bindLookControl = (controller: dat.GUIController, key: LookKey, immediate = false) => {
    const apply = () => {
      const patch = { [key]: structuredClone(editing[key]) };
      void updateLook([key], () => options.patchLook(patch)).catch(reportError);
    };
    controller.onChange(() => {
      editVersions.set(key, ++editVersion);
      if (immediate) apply();
    });
    if (!immediate) controller.onFinishChange(apply);
  };
  const replaceLook = (update: () => Promise<void>) => updateLook(Object.keys(editing) as LookKey[], update);
  const color = gui.addFolder("水色与透射");
  const preset = {
    get name() {
      return options.readLookName?.() ?? "River High 风格化";
    },
    restore: () => void replaceLook(() => options.applyLook(options.readDefaultLook())).catch(reportError)
  };
  const presetName = color.add(preset, "name").name("当前预设");
  presetName.domElement?.querySelector("input")?.setAttribute("disabled", "true");
  for (const [key, label, max] of [
    ["shallowColor", "浅水色调", 1],
    ["deepColor", "深水色调", 1],
    ["absorption", "吸收 / 米", 1]
  ] as const) {
    const rgbFolder = color.addFolder(label);
    // RGB arrays are retained by dat.GUI, so use proxies to keep import/reset bindings current.
    for (let channel = 0; channel < 3; channel++) {
      const proxy = {
        get value() {
          return editing[key][channel];
        },
        set value(value: number) {
          editing[key][channel] = value;
        }
      };
      bindLookControl(rgbFolder.add(proxy, "value", 0, max, 0.005).name(["R", "G", "B"][channel]), key);
    }
  }
  color.open();
  const optics = gui.addFolder("折射与反射");
  bindLookControl(optics.add(editing, "indexOfRefraction", 1, 2, 0.001).name("IOR"), "indexOfRefraction");
  bindLookControl(optics.add(editing, "refractionStrength", 0, 4, 0.05).name("折射强度"), "refractionStrength");
  bindLookControl(
    optics
      .add(editing, "reflection", { "SSR → 环境 → 解析": "ssr", "环境 → 解析": "environment", 解析: "analytic" })
      .name("反射策略"),
    "reflection"
  );
  bindLookControl(optics.add(editing, "roughness", 0, 1, 0.01).name("粗糙度"), "roughness");
  bindLookControl(optics.add(editing, "reflectionIntensity", 0, 4, 0.05).name("反射强度"), "reflectionIntensity");
  bindLookControl(optics.add(editing, "directSpecular").name("直接高光"), "directSpecular", true);
  const flow = gui.addFolder("水流与泡沫");
  bindLookControl(flow.add(editing, "flowNormalStrength", 0, 1, 0.01).name("流向法线强度"), "flowNormalStrength");
  bindLookControl(flow.add(editing, "foamEnabled").name("泡沫"), "foamEnabled", true);
  bindLookControl(flow.add(editing, "foamIntensity", 0, 4, 0.05).name("泡沫强度"), "foamIntensity");
  const effects = gui.addFolder("跌水与接触特效");
  for (const [kind, label] of [
    ["splash", "水花"],
    ["mist", "水雾"],
    ["whitewater", "扩散白水"]
  ] as const) {
    const folder = effects.addFolder(label);
    for (const [key, name, min, max, step] of [
      ["enabled", "启用", 0, 1, 1],
      ["opacity", "不透明度", 0, 1, 0.01],
      ["size", "尺寸（米）", 0.05, 8, 0.05],
      ["density", "密度", 0, 1, 0.05],
      ["lifetime", "持续时间（秒）", 0.1, 8, 0.1]
    ] as const) {
      const proxy = {
        get value() {
          return editing.contactEffects?.[kind][key] ?? (key === "enabled" ? false : 0);
        },
        set value(value: number | boolean) {
          if (editing.contactEffects)
            editing.contactEffects = {
              ...editing.contactEffects,
              [kind]: { ...editing.contactEffects[kind], [key]: value }
            };
        }
      };
      const control = key === "enabled" ? folder.add(proxy, "value") : folder.add(proxy, "value", min, max, step);
      bindLookControl(control.name(name), "contactEffects", key === "enabled");
    }
  }
  const dialog = document.createElement("dialog");
  dialog.style.cssText =
    "width:min(680px,85vw);background:#173038;color:#e4f3ee;border:1px solid #76928d;border-radius:8px;padding:18px;z-index:100";
  const title = document.createElement("h3");
  title.textContent = "River 外观 JSON";
  const editor = document.createElement("textarea");
  editor.setAttribute("aria-label", "River 外观 JSON");
  editor.style.cssText = "width:100%;height:48vh;box-sizing:border-box;font:12px monospace";
  const message = document.createElement("output");
  message.setAttribute("role", "status");
  const submit = document.createElement("button");
  submit.textContent = "导入外观";
  submit.onclick = async () => {
    try {
      await replaceLook(() => options.importLook(editor.value));
      message.textContent = "已导入";
    } catch (error) {
      message.textContent = String(error);
    }
  };
  const close = document.createElement("button");
  close.textContent = "关闭";
  close.onclick = () => dialog.close();
  const download = document.createElement("button");
  download.textContent = "下载 JSON";
  download.onclick = () => {
    const url = URL.createObjectURL(new Blob([options.exportLook()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "river-high-look.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  dialog.append(title, editor, submit, download, close, message);
  document.body.append(dialog);
  const observation = gui.addFolder("时间与外观保存");
  const controls = {
    frozen: options.readSurfaceTime() !== undefined,
    time: options.readSurfaceTime() ?? 0,

    environment: true,
    restore: preset.restore,
    export: () => {
      editor.value = options.exportLook();
      message.textContent = "可复制保存，或粘贴后导入。";
      dialog.showModal();
    },
    import: () => {
      editor.value = "";
      message.textContent = "粘贴导出的外观 JSON。";
      dialog.showModal();
    }
  };
  observation
    .add(controls, "frozen")
    .name("冻结时间")
    .onChange(() => options.setSurfaceTime(controls.frozen ? controls.time : undefined));
  observation
    .add(controls, "time", 0, 120, 0.01)
    .name("固定时间（秒）")
    .onFinishChange(() => {
      controls.frozen = true;
      options.setSurfaceTime(controls.time);
      refresh();
    });
  observation.add(controls, "restore").name("恢复默认");
  observation.add(controls, "export").name("导出外观 JSON");
  observation.add(controls, "import").name("导入外观 JSON");
  const diagnostics = gui.addFolder("诊断");
  diagnostics.add(controls, "environment").name("环境提供者").onChange(options.setEnvironmentEnabled);
  return {
    refresh,
    destroy: () => {
      destroyed = true;
      dialog.remove();
    }
  };
}
