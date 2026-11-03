import { builtinBuildingPresets } from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingPresets";
import { copyBuildingPrefab } from "@galacean/engine-building/tiny-glade/components/BuildingPrefab";
import {
  placeBuildingOnLand,
  type BuildingLandQuery
} from "@galacean/engine-building/tiny-glade/components/BuildingPlacement";
import { mountMasonryAppearancePanel } from "./MasonryAppearancePanel";
import { Component, Vector3, type PrefabResource } from "@galacean/engine";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import {
  BuildingSystem,
  RoofWindowComponent,
  MainBuildingComponent,
  DecorationComponent,
  BuildingSurfaceComponent
} from "@galacean/engine-building/tiny-glade/components/BuildingComponents";
/** Small native inspector; every command uses the same Scene transaction as Agent editing. */
export function mountNativeBuildingPanel(
  project: RuntimeProjectSession,
  editor: RuntimeNativeEditor,
  focus: (position: Vector3, forward?: Vector3) => void,
  roam: () => void,
  placement?: {
    anchors(): readonly (readonly [number, number])[];
    land: BuildingLandQuery;
    appearanceEngine?: object;
  }
) {
  const panel = document.createElement("details");
  panel.id = "native-building-editor";
  panel.style.cssText =
    "position:fixed;right:18px;bottom:20px;z-index:46;width:340px;max-height:65vh;overflow:auto;background:#20282ef5;color:white;padding:10px;border-radius:8px;font:13px system-ui";
  panel.innerHTML =
    '<summary>建筑组件</summary><select data-field="component" aria-label="建筑组件" style="width:100%;margin:8px 0"></select><textarea aria-label="建筑实体与组件属性" spellcheck="false" style="width:100%;height:190px;box-sizing:border-box"></textarea><div><button data-action="apply">应用</button><button data-action="delete">删除对象</button><button data-action="undo">撤销</button><button data-action="redo">重做</button><button data-action="focus">查看对象</button><button data-action="roam">返回漫游</button></div><output style="display:block;white-space:pre-wrap"></output>';
  document.body.append(panel);
  const appearance = placement?.appearanceEngine
    ? mountMasonryAppearancePanel(panel, placement.appearanceEngine)
    : undefined;
  const select = panel.querySelector<HTMLSelectElement>('[data-field="component"]')!,
    text = panel.querySelector("textarea")!,
    output = panel.querySelector("output")!;
  let busy = false,
    disposed = false;
  const identity = () => editor.projection.queryComponents({ id: select.value })[0];
  const show = () => {
    const record = identity();
    if (!record) {
      text.value = "";
      return;
    }
    const entity = editor.projection.readEntity(record.entityId);
    const { name, position, rotation, scale, isActive } = entity;
    text.value = JSON.stringify(
      {
        entity: { name, position, rotation, scale, isActive },
        props: editor.projection.readComponent(record).props ?? {}
      },
      null,
      2
    );
  };
  const refresh = () => {
    const selected = select.value;
    select.replaceChildren();
    for (const record of editor.projection.queryComponents()) {
      const component = editor.projection.component(record.id);
      if (
        !(
          component instanceof MainBuildingComponent ||
          component instanceof DecorationComponent ||
          component instanceof BuildingSurfaceComponent
        )
      )
        continue;
      const option = document.createElement("option");
      option.value = record.id;
      option.textContent = `${component.entity.name} · ${record.type}`;
      select.append(option);
    }
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
    show();
  };
  select.onchange = show;
  const run = async (action: () => Promise<void>) => {
    if (busy || disposed) return;
    busy = true;
    panel.querySelectorAll("button").forEach((button) => (button.disabled = true));
    try {
      await action();
      if (!disposed) {
        refresh();
        output.textContent = "已提交到 Scene，后台保存中";
      }
    } catch (error) {
      output.textContent = String(error);
    } finally {
      busy = false;
      panel.querySelectorAll("button").forEach((button) => (button.disabled = false));
    }
  };
  type Command = { name: string; value: unknown };
  type Edit = ReturnType<RuntimeNativeEditor["beginEdit"]>;
  const mutate = async (commands: Command[] | ((edit: Edit, signal: AbortSignal) => Promise<Command[]>)) => {
    const signal = new AbortController().signal,
      edit = editor.beginEdit(crypto.randomUUID(), signal);
    let committed = false;
    try {
      const operations = typeof commands === "function" ? await commands(edit, signal) : commands;
      for (const command of operations)
        await edit.tools.find((tool) => tool.name === command.name)!.execute(command.value, { signal });
      await edit.prepare(signal);
      await edit.commit();
      committed = true;
      const preview = await Promise.resolve(edit.activate(signal))
        .then(() => ({ runtimeErrors: [] as string[] }))
        .catch((error) => ({ runtimeErrors: [String(error)] }));
      if (preview.runtimeErrors.length) throw Error("已提交；运行更新失败：" + preview.runtimeErrors.join("\n"));
    } catch (error) {
      if (!committed) edit.discard();
      throw error;
    }
  };
  const readAsset = async (edit: Edit, signal: AbortSignal, path: string) => {
    const response = (await edit.tools.find((tool) => tool.name === "asset.read")!.execute({ path }, { signal })) as {
      content: string;
    };
    return JSON.parse(response.content);
  };
  if (placement) {
    const creation = document.createElement("div"),
      presets = document.createElement("select"),
      button = document.createElement("button");
    presets.setAttribute("aria-label", "建筑预设");
    button.textContent = "在附近陆地创建副本";
    for (const preset of builtinBuildingPresets) {
      const option = document.createElement("option");
      option.value = preset.path;
      option.textContent = preset.name;
      presets.append(option);
    }
    creation.append(presets, button);
    panel.querySelector("summary")!.after(creation);
    button.onclick = () =>
      void run(async () => {
        let selected = "";
        await mutate(async (edit, signal) => {
          const prefab = await edit.withAsset<PrefabResource, ReturnType<typeof copyBuildingPrefab>>(
            presets.value,
            ({ resource, content }) => {
              const copy = copyBuildingPrefab(JSON.parse(content as string), crypto.randomUUID());
              const instance = resource.instantiate();
              try {
                copy.entities.find((entity) => entity.id === copy.root)!.position = placeBuildingOnLand(
                  instance,
                  placement.anchors(),
                  placement.land
                );
              } finally {
                instance.destroy();
              }
              return copy;
            }
          );
          const path = project.projectPackage.project.scene,
            source = (await readAsset(edit, signal, path)) as GalaceanSourceSceneFile;
          source.scene.rootEntities.push(prefab.root);
          source.entities.push(...prefab.entities);
          source.components.push(...prefab.components);
          selected =
            prefab.components.find((component) =>
              ["HouseComponent", "WallComponent", "FenceComponent"].includes(component.type)
            )?.id ?? "";
          return [{ name: "asset.update", value: { path, content: JSON.stringify(source) } }];
        });
        refresh();
        if (selected) {
          select.value = selected;
          show();
        }
      });
    const move = document.createElement("button");
    move.textContent = "整组移到附近陆地";
    move.dataset.action = "place";
    creation.append(move);
    move.onclick = () =>
      void run(async () => {
        const record = identity();
        if (!record) throw Error("请选择建筑组件");
        const component = editor.projection.component(record.id);
        let entity = component?.entity;
        let body: MainBuildingComponent | undefined;
        while (entity && !body) {
          body = entity
            .getComponents(Component, [])
            .find((item): item is MainBuildingComponent => item instanceof MainBuildingComponent);
          entity = entity.parent ?? undefined;
        }
        if (!body) throw Error("所选组件没有建筑主体");
        const group = BuildingSystem.forScene(body.entity.scene!).groupEntity(body);
        await mutate(async (edit, signal) => {
          const groupIdentity = editor.projection.sourceIdentity(group);
          if (!groupIdentity) throw Error("建筑组没有可编辑的 Entity 身份");
          const position = placeBuildingOnLand(group, placement.anchors(), placement.land);
          return [
            {
              name: "entity.update",
              value: { scene: groupIdentity.scene, id: groupIdentity.entityId, patch: { position } }
            }
          ];
        });
      });
  }
  panel.querySelector<HTMLButtonElement>('[data-action="apply"]')!.onclick = () =>
    void run(async () => {
      const record = identity();
      if (!record) throw Error("请选择建筑组件");
      const value = JSON.parse(text.value);
      await mutate([
        { name: "entity.update", value: { scene: record.scene, id: record.entityId, patch: value.entity } },
        { name: "component.update", value: { scene: record.scene, id: record.id, props: value.props } }
      ]);
    });
  panel.querySelector<HTMLButtonElement>('[data-action="delete"]')!.onclick = () =>
    void run(async () => {
      const record = identity();
      if (!record) throw Error("请选择建筑组件");
      const surface = editor.projection.component(record.id) instanceof BuildingSurfaceComponent;
      await mutate([
        {
          name: surface ? "component.remove" : "entity.delete",
          value: { scene: record.scene, id: surface ? record.id : record.entityId }
        }
      ]);
    });
  for (const direction of ["undo", "redo"] as const) {
    panel.querySelector<HTMLButtonElement>(`[data-action="${direction}"]`)!.onclick = () =>
      void run(async () => {
        const signal = new AbortController().signal,
          edit = editor.beginEdit(crypto.randomUUID(), signal);
        try {
          const latest = edit.history()[direction][0];
          if (!latest) throw Error(direction === "undo" ? "没有可撤销的操作" : "没有可重做的操作");
          await edit.moveHistory({ direction, transactionIds: [latest.transactionId] });
          await edit.prepare(signal);
          await edit.commit();
          await edit.activate(signal);
        } finally {
          edit.discard();
        }
      });
  }
  panel.querySelector<HTMLButtonElement>('[data-action="focus"]')!.onclick = () => {
    const record = identity(),
      component = record && editor.projection.component(record.id);
    if (component) {
      const view =
        component instanceof RoofWindowComponent
          ? BuildingSystem.forScene(component.entity.scene!).roofWindowView(component)
          : undefined;
      focus(view?.position ?? component.entity.transform.worldPosition.clone(), view?.forward);
    }
  };
  panel.querySelector<HTMLButtonElement>('[data-action="roam"]')!.onclick = roam;
  const picked = (event: Event) => {
    const id = (event as CustomEvent).detail?.component?.id;
    if (id && [...select.options].some((option) => option.value === id)) {
      select.value = id;
      show();
      panel.open = true;
    }
  };
  document.addEventListener("seed-world-picked", picked);
  const unregister = project.registerRuntimeActivation({ before: async () => {}, after: async () => refresh() });
  refresh();
  return {
    refresh,
    destroy() {
      disposed = true;
      unregister();
      appearance?.destroy();
      document.removeEventListener("seed-world-picked", picked);
      panel.remove();
    }
  };
}
