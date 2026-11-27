import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import { Material } from "@galacean/engine";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import type { WaterSourceAuthoring } from "../src/spatial/runtime/NativeWaterEditor";
import { patchWaterQualitySettings } from "@galacean/engine-water/water/native/WaterQualitySettings";
import {
  prepareWaterMaterial,
  resolveWaterMaterialLook,
  updateWaterMaterialParameters
} from "@galacean/engine-water/water/native/WaterMaterial";
import { withSeedWorldWaterColor } from "@galacean/engine-water/world/SeedWorldWaterColor";

type Edit = ReturnType<RuntimeNativeEditor["beginEdit"]>;
type Operation =
  | { operation: "create"; name: string; input: WaterSourceAuthoring; parent?: string }
  | { operation: "update"; id: string; patch: Partial<WaterSourceAuthoring> }
  | { operation: "updateMany"; updates: { id: string; patch: Partial<WaterSourceAuthoring> }[] }
  | { operation: "setEnabled"; id: string; enabled: boolean }
  | { operation: "remove"; id: string };
export async function publicCall(edit: Edit, name: string, input: unknown) {
  const tool = edit.tools.find((tool) => tool.name === name)!;
  return tool.execute(tool.parseInput(toAgentValue(input)), { signal: new AbortController().signal });
}
/** Test authoring conveniences only. Every mutation goes through the public tool contract. */
export async function editTestWaterSource(edit: Edit, scene: string, operation: Operation): Promise<string | string[]> {
  if (operation.operation === "create") {
    const entity = (await publicCall(edit, "entity.create", {
      scene,
      name: operation.name,
      ...(operation.parent ? { parentEntityId: operation.parent } : {})
    })) as { id: string };
    const component = (await publicCall(edit, "component.add", {
      scene,
      entityId: entity.id,
      type: "WaterBodyComponent",
      props: { authoring: operation.input }
    })) as { id: string };
    return component.id;
  }
  if (operation.operation === "updateMany") {
    for (const update of operation.updates) await editTestWaterSource(edit, scene, { operation: "update", ...update });
    return operation.updates.map((update) => update.id);
  }
  const id = operation.id;
  if (operation.operation === "remove") await publicCall(edit, "component.remove", { scene, id });
  else if (operation.operation === "setEnabled")
    await publicCall(edit, "component.update", { scene, id, props: { enabled: operation.enabled } });
  else {
    const record = (await publicCall(edit, "component.read", { scene, id })) as {
      props: { authoring: WaterSourceAuthoring };
    };
    const previous = record.props.authoring,
      patch = operation.patch;
    await publicCall(edit, "component.update", {
      scene,
      id,
      props: {
        authoring: {
          ...previous,
          ...patch,
          quality: patchWaterQualitySettings(patch.shape?.kind ?? previous.shape.kind, previous.quality, patch.quality)
        }
      }
    });
  }
  return id;
}
export function createWaterTestClient(project: RuntimeProjectSession, native: RuntimeNativeEditor) {
  const execute = async <T>(operation: (edit: Edit) => Promise<T>) => {
    const signal = new AbortController().signal,
      edit = native.beginEdit(crypto.randomUUID(), signal);
    try {
      const value = await operation(edit);
      await edit.prepare(signal);
      await edit.commit();
      try {
        await edit.activate(signal);
        return { value, accepted: true as const, runtimeError: undefined as string | undefined };
      } catch (error) {
        return { value, accepted: true as const, runtimeError: String(error) };
      }
    } finally {
      await edit.complete?.();
    }
  };
  return {
    execute,
    change: <T extends Operation>(operation: T) =>
      execute((edit) => editTestWaterSource(edit, project.projectPackage.project.scene, operation)) as Promise<{
        value: T extends { operation: "updateMany" } ? string[] : string;
        accepted: true;
        runtimeError?: string;
      }>,
    history: (direction: "undo" | "redo") =>
      execute(async (edit) => {
        const entry = edit.history()[direction][0];
        await publicCall(edit, `history.${direction}`, { transactionIds: [entry.transactionId] });
      }),
    color: (id: string, color: [number, number, number], scope: "shared" | "instance") =>
      execute(async (edit) => {
        const scene = project.projectPackage.project.scene;
        const record = (await publicCall(edit, "component.read", { scene, id })) as {
          props: { authoring: WaterSourceAuthoring };
        };
        const input = record.props.authoring,
          path = input.material.$ref;
        const next = await edit.withAsset<Material, ReturnType<typeof withSeedWorldWaterColor>>(
          path,
          async ({ resource }) => {
            await prepareWaterMaterial(resource);
            return withSeedWorldWaterColor(resolveWaterMaterialLook(resource), color);
          }
        );
        const file = (await publicCall(edit, "asset.read", { path })) as {
          data: Parameters<typeof updateWaterMaterialParameters>[0];
        };
        const content = JSON.stringify(updateWaterMaterialParameters(file.data, next));
        if (scope === "shared") await publicCall(edit, "asset.update", { path, content });
        else {
          const target = `Water/Materials/${crypto.randomUUID()}.mat`;
          await publicCall(edit, "asset.create", { path: target, type: "Material", content });
          await publicCall(edit, "component.update", {
            scene,
            id,
            props: { authoring: { ...input, material: { $ref: target } } }
          });
        }
      }),
    flush: () => project.flush()
  };
}
