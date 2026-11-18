import { Material } from "@galacean/engine";
import {
  prepareWaterMaterial,
  resolveWaterMaterialLook,
  updateWaterMaterialParameters,
  waterMaterialProperties,
  type WaterMaterialFile
} from "@galacean/engine-water/water/native/WaterMaterial";
import { readSeedWorldWaterColor, withSeedWorldWaterColor } from "@galacean/engine-water/world/SeedWorldWaterColor";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import type { WaterSourceAuthoring } from "./NativeWaterEditor";

/** Like the building panel, every edit invokes the public tools on one detached transaction. */
export function mountNativeWaterPanel(
  project: RuntimeProjectSession,
  editor: RuntimeNativeEditor,
  options: { close?: () => Promise<void> } = {}
) {
  const panel = document.createElement("details");
  panel.id = "native-water-editor";
  panel.style.cssText =
    "position:fixed;right:18px;top:20px;z-index:46;width:280px;max-height:75vh;overflow:auto;padding:12px;background:#20282ef5;color:#edf1f2;border-radius:8px;font:13px system-ui;line-height:1.8";
  panel.innerHTML = `<summary>水体组件</summary>
    <label>水体 <select data-body aria-label="水体" style="width:100%"></select></label>
    <label data-shape>水位偏移（米） <input data-value type="number" step="0.05" aria-label="水位偏移" style="width:100%"></label>
    <label><input data-visible type="checkbox">显示水面</label> <label><input data-enabled type="checkbox">启用水体</label>
    <button data-apply>应用形状与显示</button>
    <hr><label>材质资源 <input data-material aria-label="材质资源" style="width:100%"></label><button data-material-reference>替换材质</button>
    <label>修改范围 <select data-scope aria-label="材质修改范围"><option value="instance">此实例副本</option><option value="shared">共享材质</option></select></label>
    <label>颜色 <input type="color" aria-label="水体颜色"></label><button data-color>应用颜色</button>
    <label>材质参数 <select data-property aria-label="材质参数" style="width:100%"></select></label>
    <input data-property-value aria-label="材质参数值" style="width:100%"><small data-property-description></small><button data-property-apply>应用参数</button>
    <label>纹理槽 <select data-slot aria-label="纹理槽" style="width:100%"></select></label>
    <input data-texture aria-label="纹理资源" style="width:100%" placeholder="留空以清空此槽"><button data-texture-reference>替换此槽纹理</button>
    <hr><button data-undo>撤销</button><button data-redo>重做</button><button data-save>保存</button><button data-delete>移除水体</button>${options.close ? "<button data-close>关闭工程</button>" : ""}
    <output style="display:block;white-space:pre-wrap" aria-live="polite"></output>`;
  document.body.append(panel);
  const field = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const select = field<HTMLSelectElement>("[data-body]"),
    value = field<HTMLInputElement>("[data-value]"),
    visible = field<HTMLInputElement>("[data-visible]"),
    enabled = field<HTMLInputElement>("[data-enabled]"),
    material = field<HTMLInputElement>("[data-material]"),
    color = field<HTMLInputElement>('[type="color"]'),
    property = field<HTMLSelectElement>("[data-property]"),
    propertyValue = field<HTMLInputElement>("[data-property-value]"),
    slot = field<HTMLSelectElement>("[data-slot]"),
    texture = field<HTMLInputElement>("[data-texture]"),
    scope = field<HTMLSelectElement>("[data-scope]"),
    output = field<HTMLOutputElement>("output");
  let busy = false,
    stopped = false,
    disposed = false;
  let pendingEdit: Promise<unknown> | undefined;
  const syncControls = () =>
    panel
      .querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("button,input,select")
      .forEach((control) => (control.disabled = busy || stopped || disposed));
  const scene = project.projectPackage.project.scene;
  const identity = () => {
    const identity = editor.projection.queryComponents({ type: "WaterBodyComponent", id: select.value })[0];
    if (!identity) throw Error("请选择 Source 水体。");
    return identity;
  };
  const current = () => editor.projection.readComponent(identity()).props?.authoring as unknown as WaterSourceAuthoring;
  const file = () => {
    const content = project.projectPackage.contents[current().material.$ref];
    return typeof content === "string" ? (JSON.parse(content) as WaterMaterialFile) : undefined;
  };
  const showProperty = () => {
    const entry = file()?.shaderData[property.value];
    propertyValue.value = entry ? JSON.stringify(entry.value) : "";
    const metadata = file() && waterMaterialProperties(file()!).find((item) => item.name === property.value);
    field("[data-property-description]").textContent = metadata
      ? [
          metadata.type,
          metadata.range && `范围 ${metadata.range.join(" / ")}`,
          metadata.options && metadata.options.map((option) => `${option.label}=${option.value}`).join(", ")
        ]
          .filter(Boolean)
          .join("；")
      : "";
  };
  const showTexture = () => {
    const entry = file()?.shaderData[slot.value]?.value as { url?: string } | null;
    texture.value = entry?.url ?? "";
  };
  const show = () => {
    if (!select.value) return;
    const input = current(),
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
    field("[data-shape]").firstChild!.textContent = `${label}（米） `;
    visible.checked = input.visible ?? true;
    enabled.checked = editor.projection.readComponent(identity()).props?.enabled !== false;
    material.value = input.material.$ref;
    const body = editor.projection.component(select.value) as { authoring?: { material: Material } };
    if (body.authoring?.material)
      color.value =
        "#" +
        readSeedWorldWaterColor(resolveWaterMaterialLook(body.authoring.material))
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
    const previous = property.value,
      previousSlot = slot.value;
    property.replaceChildren();
    slot.replaceChildren();
    const source = file();
    if (source)
      for (const metadata of waterMaterialProperties(source).filter((item) => !item.hidden)) {
        const option = document.createElement("option");
        option.value = metadata.name;
        option.textContent = metadata.label;
        (metadata.type === "Texture" ? slot : property).append(option);
      }
    if ([...property.options].some((item) => item.value === previous)) property.value = previous;
    if ([...slot.options].some((item) => item.value === previousSlot)) slot.value = previousSlot;
    showProperty();
    showTexture();
  };
  const refresh = () => {
    const previous = select.value;
    select.replaceChildren();
    for (const record of editor.projection.queryComponents({ type: "WaterBodyComponent" })) {
      const option = document.createElement("option");
      option.value = record.id;
      option.textContent = editor.projection.readEntity(record.entityId).name ?? record.id;
      select.append(option);
    }
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    show();
  };
  type Edit = ReturnType<RuntimeNativeEditor["beginEdit"]>;
  const call = async (edit: Edit, name: string, input: unknown) => {
    const tool = edit.tools.find((tool) => tool.name === name)!;
    return tool.execute(tool.parseInput(input), { signal: new AbortController().signal });
  };
  const mutate = (operation: (edit: Edit) => Promise<unknown>) =>
    (pendingEdit = (async () => {
      const signal = new AbortController().signal,
        edit = editor.beginEdit(crypto.randomUUID(), signal);
      let committed = false;
      try {
        await operation(edit);
        await edit.prepare(signal);
        await edit.commit();
        committed = true;
        try {
          await edit.activate(signal);
        } catch (error) {
          throw Error(`修改已接受，运行失败：${String(error)}`);
        }
      } catch (error) {
        if (!committed) edit.discard();
        throw error;
      } finally {
        await edit.complete?.();
      }
    })());
  const run = async (operation: () => Promise<unknown>, success = "运行已更新；点击保存可确认落盘。") => {
    if (busy || stopped || disposed) return;
    busy = true;
    syncControls();
    try {
      await operation();
      if (!disposed) {
        refresh();
        output.textContent = success;
      }
    } catch (error) {
      if (!disposed) output.textContent = String(error);
    } finally {
      busy = false;
      syncControls();
    }
  };
  const read = async (edit: Edit) => {
    const record = (await call(edit, "component.read", { scene, id: select.value })) as {
      props: { authoring: WaterSourceAuthoring };
    };
    return record.props.authoring;
  };
  const update = (edit: Edit, authoring: WaterSourceAuthoring, props = {}) =>
    call(edit, "component.update", {
      scene,
      id: select.value,
      props: { authoring, ...props }
    });
  const editMaterial = (
    transform: (file: WaterMaterialFile, edit: Edit, path: string) => Promise<WaterMaterialFile> | WaterMaterialFile
  ) =>
    mutate(async (edit) => {
      const input = await read(edit),
        path = input.material.$ref;
      const response = (await call(edit, "asset.read", { path })) as { kind: "structured"; data: WaterMaterialFile };
      const next = await transform(response.data, edit, path);
      if (scope.value === "shared") await call(edit, "asset.update", { path, content: JSON.stringify(next) });
      else {
        const target = `Water/Materials/${crypto.randomUUID()}.mat`;
        await call(edit, "asset.create", { path: target, type: "Material", content: JSON.stringify(next) });
        await update(edit, { ...input, material: { $ref: target } });
      }
    });
  select.onchange = show;
  property.onchange = showProperty;
  slot.onchange = showTexture;
  field<HTMLButtonElement>("[data-apply]").onclick = () =>
    void run(() =>
      mutate(async (edit) => {
        const input = await read(edit),
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
        await update(edit, { ...input, shape: next, visible: visible.checked }, { enabled: enabled.checked });
      })
    );
  field<HTMLButtonElement>("[data-material-reference]").onclick = () =>
    void run(() =>
      mutate(async (edit) => {
        await update(edit, { ...(await read(edit)), material: { $ref: material.value } });
      })
    );
  field<HTMLButtonElement>("[data-color]").onclick = () =>
    void run(() =>
      editMaterial(async (file, edit, path) => {
        const next = await edit.withAsset<Material, ReturnType<typeof withSeedWorldWaterColor>>(
          path,
          async ({ resource }) => {
            await prepareWaterMaterial(resource);
            return withSeedWorldWaterColor(
              resolveWaterMaterialLook(resource),
              [1, 3, 5].map((index) => parseInt(color.value.slice(index, index + 2), 16)) as [number, number, number]
            );
          }
        );
        return updateWaterMaterialParameters(file, next);
      })
    );
  field<HTMLButtonElement>("[data-property-apply]").onclick = () =>
    void run(() =>
      editMaterial((file) => {
        file.shaderData[property.value] = {
          ...file.shaderData[property.value],
          value: JSON.parse(propertyValue.value)
        };
        return file;
      })
    );
  field<HTMLButtonElement>("[data-texture-reference]").onclick = () =>
    void run(() =>
      editMaterial((file) => {
        file.shaderData[slot.value] = {
          type: "Texture",
          value: texture.value.trim() ? { url: texture.value.trim() } : null
        };
        return file;
      })
    );
  for (const direction of ["undo", "redo"] as const)
    field<HTMLButtonElement>(`[data-${direction}]`).onclick = () =>
      void run(() =>
        mutate(async (edit) => {
          const entry = edit.history()[direction][0];
          if (!entry) throw Error("没有可用历史。");
          await call(edit, `history.${direction}`, { transactionIds: [entry.transactionId] });
        })
      );
  field<HTMLButtonElement>("[data-delete]").onclick = () =>
    void run(() => mutate((edit) => call(edit, "component.remove", { scene, id: select.value })));
  field<HTMLButtonElement>("[data-save]").onclick = () => void run(() => project.flush(), "保存完成。");
  if (options.close) field<HTMLButtonElement>("[data-close]").onclick = () => void run(options.close!);
  const unregister = project.registerRuntimeActivation({
    before: async () => {},
    after: async () => {
      if (!disposed) refresh();
    }
  });
  refresh();
  return {
    refresh,
    /** Pause input and drain accepted work before saving. A failed save can resume the panel. */
    async stop() {
      stopped = true;
      syncControls();
      await pendingEdit?.catch(() => {});
    },
    resume(error?: unknown) {
      if (disposed) return;
      stopped = false;
      if (error !== undefined) output.textContent = String(error);
      syncControls();
    },
    destroy() {
      disposed = true;
      unregister();
      panel.remove();
    }
  };
}
