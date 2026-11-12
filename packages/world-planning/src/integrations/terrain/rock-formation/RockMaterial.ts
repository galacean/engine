import {
  AssetType,
  Color,
  PBRMaterial,
  Shader,
  ShaderFactory,
  TextureFilterMode,
  TextureWrapMode,
  Vector3,
  type Engine,
  type Material,
  type Texture2D
} from "@galacean/engine";
import shadowReceiver from "../../../../../terrain/src/rock-formation/ShadowReceiver.glsl?raw";
import surface from "../../../../../terrain/src/rock-formation/Projection.glsl?raw";
import shader from "../../../../../terrain/src/rock-formation/RockFormation.shader?raw";
import { readRockColorBlend, type RockColorBlend } from "./ColorPalette";
import { setRockColorBlend } from "./ColorMaterial";
import grassColorField from "../../../../../terrain/src/shaders/shared/GrassColorField.glsl?raw";
import sceneSeason from "../../../../../terrain/src/shaders/shared/SceneSeason.glsl?raw";
import colorBlend from "../../../../../terrain/src/rock-formation/ColorBlend.glsl?raw";
import { DEFAULT_ROCK_TEXTURE_SCALE } from "./Settings";
import type { RockFormationSettings } from "./Settings";
import rockColor from "../../../../../terrain/src/shaders/shared/RockSurfaceColor.glsl?raw";
import rockGrass from "../../../../../terrain/src/shaders/shared/RockGrassGround.glsl?raw";
import grassField from "../../../../../terrain/src/shaders/shared/GrassSurfaceField.glsl?raw";
import relief from "../../../../../terrain/src/shaders/shared/SurfaceRelief.glsl?raw";
import climate from "../../../../../terrain/src/shaders/shared/SurfaceClimate.glsl?raw";
import surfaceLighting from "../../../../../terrain/src/shaders/shared/Lighting.glsl?raw";
import contact from "../../../../../terrain/src/shaders/shared/RockTerrainContact.glsl?raw";
import heightField from "../../../../../terrain/src/shaders/shared/TerrainHeightField.glsl?raw";
import regions from "../../../../../terrain/src/shaders/shared/TerrainRegions.glsl?raw";
import layers from "../../../../../terrain/src/shaders/shared/TerrainLayerEvaluation.glsl?raw";
import shadow from "../../../../../terrain/src/shaders/shared/Shadow.glsl?raw";

type RockTextures = { base: Texture2D; normal: Texture2D };
const textures = new WeakMap<Engine, { task: Promise<RockTextures>; value?: RockTextures }>();

/** All rock sizes borrow one engine-owned base/normal pair, including attached grass roots. */
export async function prepareRockTextures(engine: Engine, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  let entry = textures.get(engine);
  if (!entry) {
    const next = { task: undefined! as Promise<RockTextures>, value: undefined as RockTextures | undefined };
    const load = (url: URL, isSRGBColorSpace: boolean) =>
      engine.resourceManager.load<Texture2D>({
        type: AssetType.Texture,
        url: url.href,
        params: {
          isSRGBColorSpace,
          mipmap: true,
          wrapModeU: TextureWrapMode.Repeat,
          wrapModeV: TextureWrapMode.Repeat,
          filterMode: TextureFilterMode.Trilinear,
          anisoLevel: 4
        }
      });
    next.task = Promise.all([
      load(
        new URL("../../../../../terrain/src/rock-formation/assets/marble_cliff_05_disp_1k.png", import.meta.url),
        true
      ),
      load(
        new URL("../../../../../terrain/src/rock-formation/assets/marble_cliff_05_nor_gl_1k.png", import.meta.url),
        false
      )
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

/** Creates the common projected rock material after prepareRockTextures. Zero scale selects each renderer's OBB scale. */
export function createRockFormationMaterial(
  engine: Engine,
  textureScale = DEFAULT_ROCK_TEXTURE_SCALE,
  colorBlend: RockColorBlend = readRockColorBlend()
): PBRMaterial {
  const texture = textures.get(engine)?.value;
  if (!texture) throw Error("Rock textures must be prepared before publication");
  registerRockSurfaceIncludes();
  const material = new PBRMaterial(engine);
  try {
    material.shader = Shader.find("SeedWorld/RockSurface") ?? Shader.create(shader);
    material.baseColor = new Color(1, 1, 1, 1);
    material.roughness = 1;
    material.metallic = 0;
    material.shaderData.setTexture("material_OriginalRockTexture", texture.base);
    material.shaderData.setTexture("material_WorldRockNormal", texture.normal);
    setRockTextureScale(material, textureScale);
    material.shaderData.setFloat("material_WorldRockNormalStrength", 0.35);
    material.shaderData.setFloat("material_WorldRockProjectionEnable", 1);
    material.shaderData.setFloat("material_WorldGrassEnable", 1);
    material.shaderData.setFloat("material_WorldGrassCoverageFromMesh", 1);
    material.shaderData.setFloat("material_WorldGrassSlope", Math.cos((35 * Math.PI) / 180));
    material.shaderData.setFloat("material_RockGrassCoveragePreview", 0);
    setRockColorBlend(material, colorBlend);
    return material;
  } catch (error) {
    material.destroy();
    throw error;
  }
}

/** Material edits preserve the shared texture and geometry resources. */
export function setRockTextureScale(material: Material, textureScale: number): void {
  material.shaderData.setFloat("material_OriginalRockTextureScale", Math.max(0, textureScale));
}

export function bindRockGrassGroundMaterial(
  engine: Engine,
  material: Material,
  settings: Pick<RockFormationSettings, "textureScale" | "colorBlend">
): void {
  const texture = textures.get(engine)?.value;
  if (texture) material.shaderData.setTexture("material_OriginalRockTexture", texture.base);
  setRockTextureScale(material, settings.textureScale);
  material.shaderData.setVector3("material_RockColor", new Vector3(...settings.colorBlend.color));
}

/** Private PBR includes preserve the engine's global structs and other materials. */
export function registerRockSurfaceIncludes(): void {
  if (!ShaderFactory.includeMap["SeedWorld/RockSurface/ShadowReceiver.glsl"])
    ShaderFactory.registerInclude("SeedWorld/RockSurface/ShadowReceiver.glsl", shadowReceiver);
  if (!ShaderFactory.includeMap["SeedWorld/RockSurface/ColorBlend.glsl"])
    ShaderFactory.registerInclude("SeedWorld/RockSurface/ColorBlend.glsl", colorBlend);
  for (const [name, source] of [
    ["shared/GrassColorField.glsl", grassColorField],
    ["shared/SceneSeason.glsl", sceneSeason]
  ])
    if (!ShaderFactory.includeMap[name]) ShaderFactory.registerInclude(name, source);
  for (const [name, source] of [
    ["shared/RockTerrainContact.glsl", contact],
    ["shared/TerrainHeightField.glsl", heightField],
    ["shared/TerrainRegions.glsl", regions],
    ["shared/TerrainLayerEvaluation.glsl", layers],
    ["shared/RockSurfaceColor.glsl", rockColor],
    ["shared/RockGrassGround.glsl", rockGrass],
    ["shared/GrassSurfaceField.glsl", grassField],
    ["shared/SurfaceRelief.glsl", relief],
    ["shared/SurfaceClimate.glsl", climate],
    ["shared/Lighting.glsl", surfaceLighting],
    ["shared/Shadow.glsl", shadow]
  ])
    if (!ShaderFactory.includeMap[name]) ShaderFactory.registerInclude(name, source);
  const forwardName = "ShaderLibrary/PBR/ForwardPassPBR.glsl";
  const attributeName = "ShaderLibrary/Common/Attributes.glsl";
  const varyingName = "ShaderLibrary/PBR/VaryingsPBR.glsl";
  const vertexHook = "varyings.positionWS = vertexInputs.positionWS;";
  const owned = "SeedWorld/RockSurface/";
  if (ShaderFactory.includeMap[owned + "Forward.glsl"]) return;
  const forward = ShaderFactory.includeMap[forwardName],
    attributes = ShaderFactory.includeMap[attributeName],
    varyings = ShaderFactory.includeMap[varyingName];
  if (
    !forward ||
    forward.split(vertexHook).length !== 2 ||
    !/struct Attributes\s*\{/.test(attributes ?? "") ||
    !/struct Varyings\s*\{/.test(varyings ?? "")
  )
    throw Error("Rock surface requires the engine PBR vertex/attribute/varying hooks");
  ShaderFactory.registerInclude(owned + "Attributes.glsl", attributes);
  ShaderFactory.registerInclude(
    owned + "Varyings.glsl",
    varyings.replace(
      /struct Varyings\s*\{/,
      (match) => `${match}
    #ifdef MATERIAL_TERRAIN_HEIGHT_FIELD
      float rockGroundClearance;
    #endif`
    )
  );
  ShaderFactory.registerInclude(
    owned + "Forward.glsl",
    forward
      .replace('"ShaderLibrary/PBR/LightDirectPBR.glsl"', '"shared/Lighting.glsl"')
      .replace('#include "ShaderLibrary/PBR/LightIndirectPBR.glsl"', "")
      .replace(attributeName, owned + "Attributes.glsl")
      .replace(varyingName, owned + "Varyings.glsl")
      .replace(
        vertexHook,
        `${vertexHook}
      #ifdef MATERIAL_TERRAIN_HEIGHT_FIELD
        varyings.rockGroundClearance = terrainProjectRockGroundClearance(vertexInputs.positionWS);
      #endif`
      )
  );
  ShaderFactory.registerInclude(owned + "Projection.glsl", surface);
}
