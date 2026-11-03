/// <reference types="vite/client" />
import type { Engine, PrefabResource } from "@galacean/engine";
import type {
  RuntimeProjectManifest,
  RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";
import manifest from "../assets/native/manifest.json";
import { registerBuildingAssetComponents } from "./BuildingAssetKit";

export const BUILTIN_BUILDING_ASSETS = "Building/Units/building-kit.prefab";
const urls = import.meta.glob("../assets/native/**/*.{prefab,mesh,mat,tex,shaderc}", { eager: true, as: "url" });
export const builtinBuildingAssetFiles: RuntimeProjectManifest["files"] = manifest.map((entry) => {
  const path = urls["../assets/native" + entry.file];
  if (!path) throw Error("Missing builtin native building asset: " + entry.file);
  return {
    virtualPath: entry.virtualPath,
    path: new URL(path, import.meta.url).href,
    type: entry.type,
    dependencies: entry.dependencies
  };
});
/** Explicit fixture/preset installation. Production installs the same descriptors through its project. */
export async function loadBuiltinBuildingAssets(engine: Engine): Promise<PrefabResource> {
  registerBuildingAssetComponents();
  const contents: Record<string, string> = {};
  await Promise.all(
    builtinBuildingAssetFiles
      .filter((file) => file.type === "Prefab")
      .map(async (file) => {
        const response = await fetch(file.path);
        if (!response.ok) throw Error("Failed native prefab fetch: " + file.virtualPath);
        contents[file.virtualPath] = await response.text();
      })
  );
  const pack = { project: { files: builtinBuildingAssetFiles }, contents } as RuntimeProjectPackage;
  const resources = builtinBuildingAssetFiles.map((file) => {
    if (file.type !== "Prefab") return file;
    const content = compileProjectResource(pack, file.virtualPath);
    if (typeof content !== "string") throw Error("Missing native prefab source: " + file.virtualPath);
    return { ...file, path: "data:application/json," + encodeURIComponent(content) };
  });
  engine.resourceManager.registerVirtualResources(resources);
  return engine.resourceManager.load<PrefabResource>({ url: BUILTIN_BUILDING_ASSETS });
}
