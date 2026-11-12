import {
  AssetType,
  TextureFilterMode,
  TextureWrapMode,
  Vector3,
  type Engine,
  type Material,
  type PBRMaterial,
  type Texture2D
} from "@galacean/engine";
import { createSurfaceMaterial } from "@galacean/engine-terrain/surface/SurfaceMaterial";
import { readRockColorBlend, type RockColorBlend } from "./ColorPalette";
import { setRockColorBlend } from "./ColorMaterial";
import { DEFAULT_ROCK_TEXTURE_SCALE } from "./Settings";
import type { RockFormationSettings } from "./Settings";

type RockTextures = { base: Texture2D; normal: Texture2D };
const textures = new WeakMap<Engine, { task: Promise<RockTextures>; value?: RockTextures }>();

/** All rock sizes borrow one engine-owned base/normal pair, including attached grass roots. */
export async function prepareRockTextures(engine: Engine, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  let entry = textures.get(engine);
  if (!entry) {
    const next = { task: undefined! as Promise<RockTextures>, value: undefined as RockTextures | undefined };
    const load = async (url: URL) => {
      const texture = await engine.resourceManager.load<Texture2D>({ type: AssetType.KTX2, url: url.href });
      texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
      texture.filterMode = TextureFilterMode.Trilinear;
      texture.anisoLevel = 4;
      return texture;
    };
    next.task = Promise.all([
      load(new URL("../../../../../terrain/src/rock-formation/assets/rock-base-512.ktx2", import.meta.url)),
      load(new URL("../../../../../terrain/src/rock-formation/assets/rock-normal-512.ktx2", import.meta.url))
    ])
      .then(([base, normal]) => (next.value = { base, normal }))
      .catch((error) => {
        textures.delete(engine);
        throw error;
      });
    textures.set(engine, (entry = next));
  }
  await new Promise<void>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    entry!.task.then(
      () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
  signal.throwIfAborted();
}

/** Creates an owned Surface material borrowing the prepared world-projected textures.
 * @param engine Resource owner.
 * @param textureScale World-space repeat size in metres; zero uses each renderer’s repeat size.
 * @param colorBlend Shared rock tint.
 * @returns Surface material used by procedural rocks.
 */
export function createRockFormationMaterial(
  engine: Engine,
  textureScale = DEFAULT_ROCK_TEXTURE_SCALE,
  colorBlend: RockColorBlend = readRockColorBlend()
): PBRMaterial {
  const texture = textures.get(engine)?.value;
  if (!texture) throw Error("Rock textures must be prepared before publication");
  const material = createSurfaceMaterial(engine, {
    baseTexture: texture.base,
    normalTexture: texture.normal,
    worldBase: true,
    worldNormal: true,
    textureSizeMetres: textureScale
  });
  setRockColorBlend(material, colorBlend);
  return material;
}
/** Updates world-space repeat size without replacing shared textures.
 * @param material Target surface.
 * @param textureScale Repeat size in metres; zero uses each renderer’s repeat size.
 */
export function setRockTextureScale(material: Material, textureScale: number): void {
  material.shaderData.setFloat("material_WorldTextureSize", Math.max(0, textureScale));
}

export function bindRockGrassGroundMaterial(
  engine: Engine,
  material: Material,
  settings: Pick<RockFormationSettings, "textureScale" | "colorBlend">
): void {
  const texture = textures.get(engine)?.value;
  if (texture) material.shaderData.setTexture("material_OriginalRockTexture", texture.base);
  material.shaderData.setFloat("material_OriginalRockTextureScale", Math.max(0, settings.textureScale));
  material.shaderData.setVector3("material_RockColor", new Vector3(...settings.colorBlend.color));
}
