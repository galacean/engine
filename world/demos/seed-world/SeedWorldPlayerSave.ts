import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { SEED_WORLD_EDITOR_PATH } from "./SeedWorldProjectFormats.ts";
import { seedWorldPlayerStateKey } from "@galacean/engine-world-planning/world/SeedWorldPlayerState";

/** Clear both startup camera sources without deleting world authoring or gameplay state. */
export async function clearSeedWorldPlayerSave(
  project: Pick<RuntimeProjectSession, "update" | "flush">,
  seed: number,
  storage: Pick<Storage, "removeItem">
): Promise<void> {
  await project.update((pack) => {
    const content = pack.contents[SEED_WORLD_EDITOR_PATH];
    if (content === undefined) return pack;
    if (typeof content !== "string") throw new Error("世界编辑存档必须为 JSON 文本");
    const editor = JSON.parse(content);
    if (
      editor?.format !== "seed-world-editor" ||
      editor.version !== 2 ||
      !editor.settings ||
      typeof editor.settings !== "object" ||
      Array.isArray(editor.settings)
    ) {
      throw new Error("世界编辑存档格式无效");
    }
    if (!Object.hasOwn(editor.settings, "camera")) return pack;
    delete editor.settings.camera;
    return { ...pack, contents: { ...pack.contents, [SEED_WORLD_EDITOR_PATH]: JSON.stringify(editor) } };
  });
  await project.flush();
  // Only clear the fallback camera source after the project checkpoint succeeds.
  storage.removeItem(seedWorldPlayerStateKey(String(seed)));
}
