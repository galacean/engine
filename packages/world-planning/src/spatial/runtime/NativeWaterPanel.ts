import { resolveWaterMaterialLook } from "@galacean/engine-water/water/native/WaterMaterial";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/index";
import { readSeedWorldWaterColor } from "@galacean/engine-water/world/SeedWorldWaterColor";
import type { NativeWaterEditor, WaterSourceAuthoring } from "./NativeWaterEditor";
import { editWaterSource, primaryWaterNormal } from "./NativeWaterEditor";

/** The panel edits Source through the same facade and history used by tools. */
export function mountNativeWaterPanel(water: NativeWaterEditor, options: { close?: () => Promise<void> } = {}) {
  const panel = document.createElement("details");
  panel.id = "native-water-editor";
  panel.open = true;
  panel.style.cssText =
    "position:fixed;right:18px;top:20px;z-index:46;width:280px;padding:12px;background:#20282ef5;color:#edf1f2;border-radius:8px;font:13px system-ui;line-height:1.8";
  panel.innerHTML = `<summary>水体组件</summary>
    <label>水体 <select aria-label="水体" style="width:100%"></select></label>
    <label data-shape>水位偏移（米） <input data-value type="number" step="0.05" aria-label="水位偏移" style="width:100%"></label>
    <label><input data-visible type="checkbox">显示水面</label> <label><input data-enabled type="checkbox">启用水体</label>
    <button data-apply>应用形状与显示</button>
    <hr><label>颜色 <input type="color" aria-label="水体颜色"></label><button data-color>应用到此实例</button>
    <label>材质资源 <input data-material aria-label="材质资源" style="width:100%"></label><button data-material-reference>替换材质</button>
    <label>法线纹理 <input data-texture aria-label="法线纹理" style="width:100%"></label><button data-texture-reference>替换此实例纹理</button>
    <hr><button data-undo>撤销</button><button data-redo>重做</button><button data-save>保存</button><button data-delete>移除水体</button>${options.close ? "<button data-close>关闭工程</button>" : ""}
    <output style="display:block;white-space:pre-wrap" aria-live="polite"></output>`;
  document.body.append(panel);
  const select = panel.querySelector("select")!,
    value = panel.querySelector<HTMLInputElement>("[data-value]")!,
    visible = panel.querySelector<HTMLInputElement>("[data-visible]")!,
    enabled = panel.querySelector<HTMLInputElement>("[data-enabled]")!,
    color = panel.querySelector<HTMLInputElement>('[type="color"]')!,
    material = panel.querySelector<HTMLInputElement>("[data-material]")!,
    texture = panel.querySelector<HTMLInputElement>("[data-texture]")!,
    output = panel.querySelector("output")!;
  let disposed = false,
    busy = false;
  const current = () => {
    const body = water.editor.projection.component(select.value);
    if (!(body instanceof WaterBodyComponent) || !body.authoring) throw new Error("请选择有作者数据的水体。");
    return body;
  };
  const show = () => {
    if (!select.value) return;
    const body = current(),
      input = body.authoring!,
      shape = input.shape;
    value.value = String(
      shape.kind === "lake"
        ? shape.levelOffsetM
        : shape.kind === "river"
          ? shape.course.points[0].width
          : shape.layout.size
    );
    const label = shape.kind === "river" ? "统一河宽" : shape.kind === "ocean" ? "海面范围" : "水位偏移";
    value.setAttribute("aria-label", label);
    panel.querySelector("[data-shape]")!.firstChild!.textContent = `${label}（米） `;
    visible.checked = input.visible ?? true;
    enabled.checked = body.enabled;
    color.value =
      "#" +
      readSeedWorldWaterColor(resolveWaterMaterialLook(input.material))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    const source = water.editor.projection.readComponent(water.editor.projection.identityOf(body)!).props
      ?.authoring as unknown as WaterSourceAuthoring;
    material.value = source.material?.$ref ?? "";
    texture.value = "";
    const content = source.material && water.project.projectPackage.contents[source.material.$ref];
    if (typeof content === "string") {
      const file = JSON.parse(content),
        property = primaryWaterNormal(file);
      if (property) texture.value = file.shaderData[property].value.url;
    }
  };
  const refresh = () => {
    const previous = select.value;
    select.replaceChildren();
    for (const identity of water.editor.projection.queryComponents({ type: "WaterBodyComponent" })) {
      const body = water.editor.projection.component(identity.id);
      if (!(body instanceof WaterBodyComponent) || !body.authoring) continue;
      const option = document.createElement("option");
      option.value = identity.id;
      option.textContent = body.entity.name;
      select.append(option);
    }
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    show();
  };
  const run = async (operation: () => Promise<{ runtimeError?: string; message?: string } | void>) => {
    if (busy || disposed) return;
    busy = true;
    panel.querySelectorAll("button").forEach((button) => (button.disabled = true));
    try {
      const result = await operation();
      if (disposed) return;
      refresh();
      output.textContent = result?.runtimeError
        ? `修改已接受，运行失败：${result.runtimeError}`
        : (result?.message ?? "运行已更新；点击保存可确认落盘。");
    } catch (error) {
      if (!disposed) output.textContent = String(error);
    } finally {
      busy = false;
      panel.querySelectorAll("button").forEach((button) => (button.disabled = false));
    }
  };
  select.onchange = show;
  panel.querySelector<HTMLButtonElement>("[data-apply]")!.onclick = () =>
    void run(async () => {
      const input = current().authoring!,
        shape = input.shape;
      const next =
        shape.kind === "lake"
          ? { ...shape, levelOffsetM: value.valueAsNumber }
          : shape.kind === "river"
            ? {
                ...shape,
                course: {
                  ...shape.course,
                  points: shape.course.points.map((point) => ({ ...point, width: value.valueAsNumber }))
                }
              }
            : { ...shape, layout: { ...shape.layout, size: value.valueAsNumber } };
      return water.execute(async (edit) => {
        const scene = water.project.projectPackage.project.scene;
        await editWaterSource(edit, scene, {
          operation: "update",
          id: select.value,
          patch: { shape: next, visible: visible.checked }
        });
        await editWaterSource(edit, scene, { operation: "setEnabled", id: select.value, enabled: enabled.checked });
      });
    });
  panel.querySelector<HTMLButtonElement>("[data-color]")!.onclick = () =>
    void run(() =>
      water.color(
        select.value,
        [1, 3, 5].map((index) => Number.parseInt(color.value.slice(index, index + 2), 16)) as [number, number, number],
        "instance"
      )
    );
  panel.querySelector<HTMLButtonElement>("[data-material-reference]")!.onclick = () =>
    void run(() =>
      water.change({ operation: "update", id: select.value, patch: { material: { $ref: material.value } } })
    );
  panel.querySelector<HTMLButtonElement>("[data-texture-reference]")!.onclick = () =>
    void run(() => water.texture(select.value, texture.value, "instance"));
  for (const direction of ["undo", "redo"] as const)
    panel.querySelector<HTMLButtonElement>(`[data-${direction}]`)!.onclick = () =>
      void run(() => water.history(direction));
  panel.querySelector<HTMLButtonElement>("[data-delete]")!.onclick = () =>
    void run(() => water.change({ operation: "remove", id: select.value }));
  panel.querySelector<HTMLButtonElement>("[data-save]")!.onclick = () =>
    void run(async () => {
      await water.flush();
      return { message: "保存完成。" };
    });
  const close = panel.querySelector<HTMLButtonElement>("[data-close]");
  if (close) close.onclick = () => void run(options.close!);
  const unregister = water.project.registerRuntimeActivation({
    before: async () => {},
    after: async () => {
      if (!disposed) refresh();
    }
  });
  refresh();
  return {
    refresh,
    destroy() {
      disposed = true;
      unregister();
      panel.remove();
    }
  };
}
