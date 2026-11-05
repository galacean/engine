import type { WaterShapeAuthoring } from "@galacean/engine-water/water/native/WaterAuthoring";
import { validateWaterAuthoringSettings } from "@galacean/engine-water/water/native/WaterAuthoring";
import { stringifyWaterData } from "@galacean/engine-water/water/native/WaterResources";
import type { WaterResourceFile } from "@galacean/engine-water/water/native/WaterResources";
import type { WaterBodyAuthoring } from "@galacean/engine-water/water/native/WaterBodyComponent";
import type { RuntimeEditor, RuntimeEditorEdit } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { withSeedWorldWaterColor, type SeedWorldWaterColorRgb } from "@galacean/engine-water/world/SeedWorldWaterColor";
import { validateWaterResourceFile } from "@galacean/engine-water/water/native/WaterProjectFormats";
import { Material } from "@galacean/engine";
import {
  createWaterQualitySettings,
  patchWaterQualitySettings,
  type WaterQualityInput
} from "@galacean/engine-water/water/native/WaterQualitySettings";
import {
  prepareWaterMaterial,
  resolveWaterMaterialLook,
  updateWaterMaterialParameters,
  type WaterMaterialFile
} from "@galacean/engine-water/water/native/WaterMaterial";

export interface WaterSourceAuthoring {
  shape: WaterShapeAuthoring;
  terrain?: { $ref: string };
  terrainBinding?: "host";
  quality?: WaterQualityInput;
  material: { $ref: string };
  connections?: {
    id: string;
    target: GalaceanComponentRef;
    section: readonly [readonly [number, number], readonly [number, number]];
    transitionLengths: readonly [number, number];
  }[];
  visible?: boolean;
  priority?: number;
  interaction?: WaterBodyAuthoring["interaction"];
}

export type WaterSourceOperation =
  | { operation: "create"; name: string; input: WaterSourceAuthoring; parent?: string }
  | { operation: "update"; id: string; patch: Partial<WaterSourceAuthoring> }
  | { operation: "updateMany"; updates: { id: string; patch: Partial<WaterSourceAuthoring> }[] }
  | { operation: "setEnabled"; id: string; enabled: boolean }
  | { operation: "remove"; id: string };

/** UI and tools contribute to the same detached edit. Methods never publish or maintain private history. */
export function editWaterSource(
  edit: Pick<RuntimeEditorEdit, "run">,
  scenePath: string,
  operation: WaterSourceOperation
) {
  return edit.run(({ draft, edited }) => {
    if (!operation || !["create", "update", "updateMany", "setEnabled", "remove"].includes(operation.operation))
      throw new Error("INVALID_ARGUMENT: Unknown Water author operation.");
    const scene = new RuntimeSceneEdit(draft, scenePath);
    const references = (input: WaterSourceAuthoring): WaterSourceAuthoring => ({
      ...input,
      quality: createWaterQualitySettings(input.shape.kind, input.quality),
      connections: input.connections?.map((connection) => ({
        ...connection,
        target:
          typeof connection.target.$component === "string" && connection.target.$component.startsWith("@instance:")
            ? scene.componentReference(connection.target.$component)
            : connection.target
      }))
    });
    if (operation.operation === "updateMany") {
      if (
        !Array.isArray(operation.updates) ||
        !operation.updates.length ||
        new Set(operation.updates.map((update) => update.id)).size !== operation.updates.length
      )
        throw new Error("INVALID_ARGUMENT: updateMany requires unique targets.");
      const updates = operation.updates.map(({ id, patch }) => {
        if (!scene.queryComponents({ id, type: "WaterBodyComponent" }).length)
          throw new Error(`NOT_FOUND: Water component '${id}'.`);
        const previous = scene.readComponent(id).props?.authoring as unknown as WaterSourceAuthoring;
        const authoring = references({
          ...previous,
          ...patch,
          quality: patchWaterQualitySettings(patch.shape?.kind ?? previous.shape.kind, previous.quality, patch.quality)
        });
        validateWaterAuthoringSettings(authoring);
        return { id, authoring };
      });
      for (const { id, authoring } of updates)
        scene.updateComponent(id, { authoring: authoring as unknown as GalaceanSourceValueRecord });
      edited();
      return updates.map((update) => update.id);
    }
    if (operation.operation === "create") {
      validateWaterAuthoringSettings(operation.input);
      const entity = scene.create({ name: operation.name, parentEntityId: operation.parent });
      const component = scene.addComponent(entity.id, {
        type: "WaterBodyComponent",
        props: { authoring: references(operation.input) as unknown as GalaceanSourceValueRecord }
      });
      edited();
      return component.id;
    }
    const identity = scene.queryComponents({ id: operation.id, type: "WaterBodyComponent" })[0];
    if (!identity) throw new Error(`NOT_FOUND: Water component '${operation.id}' does not exist.`);
    if (operation.operation === "remove") {
      for (const peer of scene.queryComponents({ type: "WaterBodyComponent" })) {
        const input = scene.readComponent(peer.id).props?.authoring as unknown as WaterSourceAuthoring | undefined;
        const connections = input?.connections?.filter(
          (connection) => scene.resolveComponentReference(connection.target, peer.id) !== identity.id
        );
        if (input && connections?.length !== input.connections?.length)
          scene.updateComponent(peer.id, {
            authoring: { ...input, connections } as unknown as GalaceanSourceValueRecord
          });
      }
      scene.removeComponent(identity.id);
    } else if (operation.operation === "setEnabled") {
      if (typeof operation.enabled !== "boolean") throw new TypeError("Water enabled must be boolean.");
      scene.updateComponent(identity.id, { enabled: operation.enabled });
    } else {
      const previous = scene.readComponent(identity.id).props?.authoring as unknown as WaterSourceAuthoring;
      const authoring = references({
        ...previous,
        ...operation.patch,
        quality: patchWaterQualitySettings(
          operation.patch.shape?.kind ?? previous.shape.kind,
          previous.quality,
          operation.patch.quality
        )
      });
      validateWaterAuthoringSettings(authoring);
      scene.updateComponent(identity.id, { authoring: authoring as unknown as GalaceanSourceValueRecord });
    }
    edited();
    return identity.id;
  });
}

export function writeWaterAsset(edit: Pick<RuntimeEditorEdit, "run">, path: string, file: WaterResourceFile) {
  return edit.run(
    ({ draft, edited }) => {
      const content = stringifyWaterData(file);
      if (draft.list().some((file) => file.virtualPath === path)) draft.update(path, content);
      else draft.create({ virtualPath: path, path, type: "WaterResource" }, content);
      edited();
    },
    true,
    [path]
  );
}

export async function editWaterColor(
  edit: Pick<RuntimeEditorEdit, "run" | "withAsset">,
  scenePath: string,
  id: string,
  color: SeedWorldWaterColorRgb,
  scope: "shared" | "instance"
): Promise<void> {
  if (!["shared", "instance"].includes(scope))
    throw new Error("INVALID_ARGUMENT: Water color scope must be shared or instance.");
  const input = await edit.run(({ draft }) => {
    const scene = new RuntimeSceneEdit(draft, scenePath);
    return scene.readComponent(id).props?.authoring as unknown as WaterSourceAuthoring;
  });
  const materialPath = input.material.$ref;
  const next = await edit.withAsset<Material, ReturnType<typeof withSeedWorldWaterColor>>(
    materialPath,
    async ({ resource }) => {
      await prepareWaterMaterial(resource);
      return withSeedWorldWaterColor(resolveWaterMaterialLook(resource), color);
    }
  );
  await edit.run(({ draft, edited }) => {
    const target = scope === "shared" ? materialPath : `Water/Materials/${crypto.randomUUID()}.mat`;
    const content = JSON.stringify(
      updateWaterMaterialParameters(JSON.parse(draft.read(materialPath) as string) as WaterMaterialFile, next)
    );
    if (target === materialPath) draft.update(target, content);
    else draft.create({ virtualPath: target, path: target, type: "Material" }, content);
    if (scope === "instance")
      new RuntimeSceneEdit(draft, scenePath).updateComponent(id, {
        authoring: { ...input, material: { $ref: target } } as unknown as GalaceanSourceValueRecord
      });
    edited();
  });
}

export function primaryWaterNormal(file: WaterMaterialFile): string | undefined {
  return ["material_Water_appearance_appearance_detailLayers_0_texture", "material_Ocean_smoothWaves"].find(
    (property) => file.shaderData[property]?.type === "Texture"
  );
}

export async function editWaterTexture(
  edit: Pick<RuntimeEditorEdit, "run">,
  scenePath: string,
  id: string,
  texture: string,
  scope: "shared" | "instance"
): Promise<void> {
  if (!["shared", "instance"].includes(scope))
    throw new Error("INVALID_ARGUMENT: Water texture scope must be shared or instance.");
  const input = await edit.run(
    ({ draft }) =>
      new RuntimeSceneEdit(draft, scenePath).readComponent(id).props?.authoring as unknown as WaterSourceAuthoring
  );
  const path = input.material?.$ref;
  if (!path) throw new Error(`Water '${id}' has no native Material.`);
  await edit.run(() => {}, true, [path]);
  await edit.run(({ draft, edited }) => {
    const material = JSON.parse(draft.read(path) as string) as WaterMaterialFile,
      property = primaryWaterNormal(material);
    if (!property) throw new Error(`Water '${id}' has no editable normal texture.`);
    const old = (material.shaderData[property].value as { url: string }).url;
    for (const entry of Object.values(material.shaderData))
      if (entry.type === "Texture" && (entry.value as { url: string }).url === old) entry.value = { url: texture };
    const target = scope === "shared" ? path : `Water/Materials/${crypto.randomUUID()}.mat`;
    if (target === path) draft.update(path, JSON.stringify(material));
    else {
      draft.create({ virtualPath: target, path: target, type: "Material" }, JSON.stringify(material));
      new RuntimeSceneEdit(draft, scenePath).updateComponent(id, {
        authoring: { ...input, material: { $ref: target } } as unknown as GalaceanSourceValueRecord
      });
    }
    edited();
  });
}

/** Small application facade. Acceptance, runtime activation and saving remain separate results. */
export class NativeWaterEditor {
  private tail: Promise<unknown> = Promise.resolve();
  private closing = false;
  constructor(
    readonly project: RuntimeProjectSession,
    readonly editor: RuntimeEditor
  ) {}
  execute<T>(
    operation: (edit: RuntimeEditorEdit) => Promise<T>
  ): Promise<{ value: T; accepted: true; runtimeError?: string }> {
    if (this.closing) return Promise.reject(new Error("CLOSED: Water editor is closing."));
    const task = this.tail
      .catch(() => {})
      .then(async () => {
        const signal = new AbortController().signal,
          edit = this.editor.beginEdit(crypto.randomUUID(), signal);
        try {
          const value = await operation(edit);
          await edit.prepare(signal);
          await edit.commit();
          try {
            await edit.activate(signal);
            return { value, accepted: true as const };
          } catch (error) {
            return { value, accepted: true as const, runtimeError: String(error) };
          }
        } finally {
          edit.discard();
        }
      });
    this.tail = task;
    return task;
  }
  change<T extends WaterSourceOperation>(operation: T) {
    return this.execute(
      (edit) =>
        editWaterSource(edit, this.project.projectPackage.project.scene, operation) as Promise<
          T extends { operation: "updateMany" } ? string[] : string
        >
    );
  }
  color(id: string, color: SeedWorldWaterColorRgb, scope: "shared" | "instance") {
    return this.execute((edit) => editWaterColor(edit, this.project.projectPackage.project.scene, id, color, scope));
  }
  texture(id: string, path: string, scope: "shared" | "instance") {
    return this.execute((edit) => editWaterTexture(edit, this.project.projectPackage.project.scene, id, path, scope));
  }
  history(direction: "undo" | "redo") {
    return this.execute(async (edit) => {
      const transaction = edit.history()[direction][0];
      if (!transaction) throw new Error(`No Water ${direction} operation is available.`);
      await edit.moveHistory({ direction, transactionIds: [transaction.transactionId] });
    });
  }
  async flush(): Promise<void> {
    await this.tail.catch(() => {});
    await this.project.flush();
  }
  /** Stop new author requests and drain accepted work. A save failure leaves the project available for retry. */
  async stop(): Promise<void> {
    this.closing = true;
    await this.tail.catch(() => {});
  }
  async close(): Promise<void> {
    await this.stop();
    await this.flush();
  }
}
