import { WaterBodyComponent, WaterSystem } from "@galacean/engine-water/water/native/index";
import { validateWaterAuthoringSettings } from "@galacean/engine-water/water/native/WaterAuthoring";
import { hashStableValue } from "@galacean/engine-water/water/compiler/shared/determinism";
import { decodeWaterTerrainAssets } from "@galacean/engine-water/water/native/WaterTerrainAssets";
import type { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { Material, type MeshRenderer } from "@galacean/engine";
import { prepareWaterMaterial, resolveWaterMaterialLook } from "@galacean/engine-water/water/native/WaterMaterial";
import { installLook } from "@galacean/engine-water/water/native/WaterResources";
import { WaterBodyAssetRegistry } from "@galacean/engine-water/water/runtime/body/WaterBodyAssetRegistry";

/** Adapts the public transaction to the existing Scene WaterSystem. Owns neither history nor the system. */
export class NativeWaterHost {
  private readonly unregister: (() => void)[];
  private diagnostic?: { id: string; occurredAt: string; message: string };
  constructor(
    project: RuntimeProjectSession,
    private readonly editor: RuntimeEditor,
    readonly system: WaterSystem,
    options: { hostTerrain?: boolean; consumeHostInputs?: () => Promise<void>; physicalPublication?: () => void } = {}
  ) {
    let physicalKey: string | undefined;
    let effectiveEnabled = system.runtimeState.effectiveEnabled;
    const bindIdentities = () => {
      for (const identity of editor.projection.queryComponents({ type: "WaterBodyComponent" })) {
        const body = editor.projection.component(identity.id);
        if (body instanceof WaterBodyComponent && body.authoring) {
          const id = `water:${hashStableValue([identity.scene, identity.id])}`;
          if (body.waterId !== id) body.waterId = id;
        }
      }
    };
    bindIdentities();
    let applied = false;
    this.unregister = [
      system.observeRuntimeState((state) => {
        if (state.effectiveEnabled === effectiveEnabled) return;
        effectiveEnabled = state.effectiveEnabled;
        options.physicalPublication?.();
      }),
      project.registerRuntimeActivation({
        before: async () => {
          applied = false;
          system.beginInputUpdate();
        },
        apply: async () => {
          bindIdentities();
          for (const identity of editor.projection.queryComponents({ type: "WaterBodyComponent" })) {
            const body = editor.projection.component(identity.id);
            if (body instanceof WaterBodyComponent && body.authoring) {
              const id = `water:${hashStableValue([identity.scene, identity.id])}`;
              if (body.waterId !== id) body.waterId = id;
              void system.requestAuthoringUpdate(body).catch(() => {});
            }
          }
          applied = true;
        },
        finish: () => system.endInputUpdate(applied, false),
        after: async () => {
          try {
            await options.consumeHostInputs?.();
            await system.flushAuthoring();
            const key = hashStableValue(
              system.bodies
                .filter((body) => !body.destroyed && body.configuration)
                .map((body) => ({
                  id: body.waterId,
                  asset: body.configuration!.asset.contentHash,
                  quality: body.configuration!.quality.contentHash,
                  query: body.configuration!.interaction?.query ?? true,
                  enabled: body.enabled && body.entity.isActiveInHierarchy,
                  transform: Array.from(body.entity.transform.worldMatrix.elements)
                }))
                .sort((a, b) => a.id.localeCompare(b.id))
            );
            if (physicalKey !== key) {
              options.physicalPublication?.();
              physicalKey = key;
            }
            this.diagnostic = undefined;
          } catch (error) {
            this.diagnostic = { id: "water-runtime", occurredAt: new Date().toISOString(), message: String(error) };
            throw error;
          }
        },
        diagnostics: () => (this.diagnostic ? [this.diagnostic] : [])
      }),
      editor.registerPreparation(async (edit) => {
        const paths = await edit.run(({ draft }) => {
          const scene = new RuntimeSceneEdit(draft, project.projectPackage.project.scene);
          return [
            ...new Set(
              scene.queryComponents({ type: "WaterBodyComponent" }).flatMap((identity) => {
                const input = scene.readComponent(identity.id).props?.authoring as Record<string, any> | undefined;
                return input?.terrain?.mode === "asset"
                  ? [input.terrain.description?.$ref, input.terrain.heights?.$ref].filter(
                      (path): path is string => typeof path === "string"
                    )
                  : [];
              })
            )
          ];
        });
        await edit.run(() => {}, true, paths);
        const terrainPairs = new Map<string, ReturnType<typeof decodeWaterTerrainAssets>>();
        const materials = await edit.run(({ draft }) => {
          const scene = new RuntimeSceneEdit(draft, project.projectPackage.project.scene);
          const materials: {
            id: string;
            path: string;
          }[] = [];
          for (const identity of scene.queryComponents({ type: "WaterBodyComponent" })) {
            const props = scene.readComponent(identity.id).props ?? {},
              input = props.authoring as Record<string, any> | undefined;
            if (!input || props.configuration !== undefined || props.waterId !== undefined)
              throw new Error(
                `Water '${identity.id}' requires Source authoring; configuration and waterId are runtime facts.`
              );
            try {
              validateWaterAuthoringSettings(input as unknown as Parameters<typeof validateWaterAuthoringSettings>[0]);
            } catch (error) {
              throw new Error(`Water '${identity.id}'.authoring: ${String(error)}`, { cause: error });
            }
            for (const connection of input.connections ?? []) {
              const target = connection.target && scene.resolveComponentReference(connection.target, identity.id);
              if (
                !target ||
                target === identity.id ||
                !scene.queryComponents({ id: target, type: "WaterBodyComponent" }).length
              )
                throw new Error(
                  `Water '${identity.id}'.connections '${connection.id}' requires another Source Water component.`
                );
            }
            if (input.terrain.mode === "host" && !options.hostTerrain)
              throw new Error(`Water '${identity.id}': this host does not provide a Terrain publication.`);
            if (input.terrain.mode === "asset") {
              const descriptionPath = input.terrain.description?.$ref,
                heightPath = input.terrain.heights?.$ref;
              if (typeof descriptionPath !== "string" || typeof heightPath !== "string")
                throw new Error(`Water '${identity.id}': terrain requires native JSON and Buffer references.`);
              const files = draft.list();
              if (
                files.find((file) => file.virtualPath === descriptionPath)?.type !== "JSON" ||
                files.find((file) => file.virtualPath === heightPath)?.type !== "Buffer"
              )
                throw new Error(`Water '${identity.id}': terrain requires JSON and Buffer asset types.`);
              const pairKey = JSON.stringify([descriptionPath, heightPath]);
              let terrain = terrainPairs.get(pairKey);
              if (!terrain) {
                const description = draft.read(descriptionPath),
                  heights = draft.read(heightPath);
                if (typeof description !== "string" || !(heights instanceof Uint8Array))
                  throw new Error(`Water '${identity.id}': terrain asset contents are unavailable.`);
                terrain = decodeWaterTerrainAssets(JSON.parse(description), heights);
                terrainPairs.set(pairKey, terrain);
              }
            }
            if (typeof input.material?.$ref !== "string")
              throw new Error(`Water '${identity.id}'.material requires a native Material reference.`);
            materials.push({ id: identity.id, path: input.material.$ref });
          }
          return materials;
        });
        for (const { id, path } of materials)
          await edit.withAsset<Material, void>(path, async ({ resource }) => {
            try {
              await prepareWaterMaterial(resource);
              installLook(new WaterBodyAssetRegistry(), resolveWaterMaterialLook(resource));
            } catch (error) {
              throw new Error(`Water '${id}'.material '${path}': ${String(error)}`);
            }
          });
      })
    ];
  }
  async flush(): Promise<void> {
    await this.system.flushAuthoring();
    await this.system.ready;
  }
  /** Only current published renderers map back to public Source identities. */
  identityForRenderer(renderer: MeshRenderer) {
    const id = this.system.activeRuntimeHost?.bodyIdForRenderer(renderer);
    if (!id) return;
    return this.editor.projection.queryComponents({ type: "WaterBodyComponent" }).find((identity) => {
      const body = this.editor.projection.component(identity.id);
      return body instanceof WaterBodyComponent && !body.destroyed && body.waterId === id;
    });
  }
  dispose(): void {
    for (const unregister of this.unregister) unregister();
  }
}
