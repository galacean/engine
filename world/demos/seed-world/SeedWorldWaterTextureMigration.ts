import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { digestSha256Hex } from "@galacean/engine-water/water/resources/sha256";
import manifest from "@galacean/engine-water/water/resources/river/assets/ktx2-manifest.json";

/** Retain saved material reference keys while upgrading untouched built-in PNGs.
 * Edited bytes, custom delivery URLs and authored color spaces remain their own assets. */
export async function migrateSeedWorldWaterTextures(project: RuntimeProjectSession): Promise<void> {
  const current = project.projectPackage;
  const changes = new Map<string, { path: string; bytes: Uint8Array }>();
  for (const texture of Object.values(manifest.textures)) {
    const legacy = `Water/Textures/${texture.id}.png`;
    const file = current.project.files.find((file) => file.virtualPath === legacy);
    if (file?.type !== "Texture" || file.path !== new URL(legacy, BUILTIN_WATER_PROJECT_URL).href) continue;
    if (file.params?.isSRGBColorSpace !== undefined && file.params.isSRGBColorSpace !== texture.isSRGBColorSpace)
      continue;
    const content = current.contents[legacy];
    if (
      content !== undefined &&
      (!(content instanceof Uint8Array) || (await digestSha256Hex(content)) !== texture.sourceSha256)
    )
      continue;
    const path = new URL(`Water/Textures/${texture.id}.ktx2`, BUILTIN_WATER_PROJECT_URL).href;
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Water texture migration: HTTP ${response.status}: ${legacy}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if ((await digestSha256Hex(bytes)) !== texture.sha256)
      throw new Error(`Water texture migration checksum: ${legacy}`);
    changes.set(legacy, { path, bytes });
  }
  if (!changes.size) return;
  // Update atomically only after every replacement is fetched and verified. The
  // legacy virtual .png key is an alias; its explicit KTX2 type selects the loader.
  await project.update((pack) => ({
    ...pack,
    project: {
      ...pack.project,
      files: pack.project.files.map((file) => {
        const change = changes.get(file.virtualPath);
        return change ? { ...file, type: "KTX2", path: change.path } : file;
      })
    },
    contents: { ...pack.contents, ...Object.fromEntries([...changes].map(([key, value]) => [key, value.bytes])) }
  }));
}
