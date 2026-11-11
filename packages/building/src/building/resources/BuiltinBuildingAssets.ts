import type { RuntimeProjectManifest } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import manifest from "../assets/native/manifest.json";

export const BUILTIN_BUILDING_ASSETS = "Building/Units/building-kit.prefab";
const urls = import.meta.glob("../assets/native/**/*.{prefab,mesh,mat,tex,ktx2,shaderc}", { eager: true, as: "url" });
export const builtinBuildingAssetFiles: RuntimeProjectManifest["files"] = manifest.map((entry) => {
  const path = urls["../assets/native/" + entry.file];
  if (!path) throw Error("Missing builtin native building asset: " + entry.file);
  return {
    virtualPath: entry.virtualPath,
    path: new URL(path, import.meta.url).href,
    type: entry.type,
    dependencies: entry.dependencies
  };
});
