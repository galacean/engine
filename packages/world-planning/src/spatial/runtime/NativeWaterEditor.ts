import { encodeWaterTerrainAssets } from "@galacean/engine-water/water/native/WaterTerrainAssets";
import type { WaterTerrainSnapshot } from "@galacean/engine-water/water/authoring/terrain/WaterTerrainSnapshot";
import type { WaterShapeAuthoring } from "@galacean/engine-water/water/native/WaterAuthoring";
import type { WaterBodyAuthoring } from "@galacean/engine-water/water/native/WaterBodyComponent";
import type { WaterQualityInput } from "@galacean/engine-water/water/native/WaterQualitySettings";
import type { RuntimeEditorEdit } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";

export interface WaterSourceAuthoring {
  shape: WaterShapeAuthoring;
  terrain: { mode: "host" } | { mode: "asset"; description: { $ref: string }; heights: { $ref: string } };
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

/** Both native resources are accepted and undone together. No custom asset type or loader. */
export function writeWaterTerrainAssets(
  edit: Pick<RuntimeEditorEdit, "run">,
  descriptionPath: string,
  terrain: WaterTerrainSnapshot
) {
  if (!descriptionPath.endsWith(".json")) throw new Error("Water terrain description requires a .json path.");
  const heightPath = descriptionPath.slice(0, -5) + ".bin";
  const encoded = encodeWaterTerrainAssets(terrain);
  return edit.run(
    ({ draft, edited }) => {
      for (const [path, type, content] of [
        [descriptionPath, "JSON", JSON.stringify(encoded.description)],
        [heightPath, "Buffer", encoded.heights]
      ] as const) {
        const existing = draft.list().find((file) => file.virtualPath === path);
        if (existing && existing.type !== type) throw new Error(`Water terrain '${path}' requires ${type}.`);
        if (existing) draft.update(path, content);
        else draft.create({ virtualPath: path, path, type }, content);
      }
      edited();
    },
    true,
    [descriptionPath, heightPath]
  );
}
