const assetExtensions: Readonly<Record<string, string>> = {
  glb: "GLTF",
  png: "Texture",
  jpg: "Texture",
  jpeg: "Texture",
  mat: "Material",
  mesh: "PrimitiveMesh",
  prefab: "Prefab",
  scene: "Scene",
  animctrl: "AnimatorController",
  ts: "script",
  js: "script"
};

/** Shared by source catalogs and import: an omitted type is not an authored Document type. */
export function projectFileType(path: string, explicitType?: string): string {
  const lower = path.toLowerCase();
  const extension = lower.split(".").pop()!;
  const inferred =
    !lower.endsWith(".d.ts") && Object.hasOwn(assetExtensions, extension) ? assetExtensions[extension] : undefined;
  if (explicitType && inferred && explicitType !== inferred) {
    throw new Error(`Asset type '${explicitType}' does not match '${path}' (${inferred})`);
  }
  return explicitType ?? inferred ?? "Document";
}
