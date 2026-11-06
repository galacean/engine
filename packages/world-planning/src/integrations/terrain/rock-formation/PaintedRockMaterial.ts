import {
  AssetType,
  ShaderFactory,
  TextureFilterMode,
  TextureWrapMode,
  Vector3,
  type Engine,
  type PBRMaterial,
  type Material,
  type Texture2D
} from "@galacean/engine";
import lighting from "@galacean/engine-terrain/rock-formation/CellularLighting.glsl?raw";
import shadowReceiver from "@galacean/engine-terrain/rock-formation/ShadowReceiver.glsl?raw";
import surface from "@galacean/engine-terrain/rock-formation/OriginalRockSurface.glsl?raw";
import grassColorField from "@galacean/engine-terrain/shaders/shared/GrassColorField.glsl?raw";
import sceneSeason from "@galacean/engine-terrain/shaders/shared/SceneSeason.glsl?raw";
import colorBlend from "@galacean/engine-terrain/rock-formation/ColorBlend.glsl?raw";
import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import { DEFAULT_ROCK_TEXTURE_SCALE } from "./Settings.ts";
import type { RockFormationSettings } from "./Settings.ts";
import rockColor from "@galacean/engine-terrain/shaders/shared/RockSurfaceColor.glsl?raw";
import rockGrass from "@galacean/engine-terrain/shaders/shared/RockGrassGround.glsl?raw";
import grassField from "@galacean/engine-terrain/shaders/shared/GrassSurfaceField.glsl?raw";
import relief from "@galacean/engine-terrain/shaders/shared/SurfaceRelief.glsl?raw";
import climate from "@galacean/engine-terrain/shaders/shared/SurfaceClimate.glsl?raw";
import surfaceLighting from "@galacean/engine-terrain/shaders/shared/Lighting.glsl?raw";
import contact from "@galacean/engine-terrain/shaders/shared/RockTerrainContact.glsl?raw";
import heightField from "@galacean/engine-terrain/shaders/shared/TerrainHeightField.glsl?raw";
import regions from "@galacean/engine-terrain/shaders/shared/TerrainRegions.glsl?raw";
import layers from "@galacean/engine-terrain/shaders/shared/TerrainLayerEvaluation.glsl?raw";
import shadow from "@galacean/engine-terrain/shaders/shared/Shadow.glsl?raw";

/** Borrow the same substrate texture and author settings as the owning rock surface. */
export function bindRockGrassGroundMaterial(
  engine: Engine,
  material: Material,
  settings: Pick<RockFormationSettings, "textureScale" | "colorBlend">
): void {
  const texture = textures.get(engine)?.texture;
  if (texture) material.shaderData.setTexture("material_OriginalRockTexture", texture);
  material.shaderData.setFloat("material_OriginalRockTextureScale", settings.textureScale);
  material.shaderData.setVector3("material_RockColor", new Vector3(...settings.colorBlend.color));
}

/** Selects cellular normal/edge attributes; both geometry modes use the texture. */
export const PAINTED_ROCK_MACRO = "SEED_ROCK_ORIGINAL_SURFACE";
const textures = new WeakMap<Engine, { task: Promise<Texture2D>; texture?: Texture2D }>();

/** ResourceManager owns the shared sRGB asset; scene candidates only borrow it. */
export async function preparePaintedRockTexture(
  engine: Engine,
  formations: readonly RockFormationMesh[],
  signal: AbortSignal
) {
  signal.throwIfAborted();
  if (!formations.length) return;
  let entry = textures.get(engine);
  if (!entry) {
    const next = { task: undefined! as Promise<Texture2D>, texture: undefined as Texture2D | undefined };
    next.task = new Promise<Texture2D>((resolve, reject) => {
      engine.resourceManager
        .load<Texture2D>({
          type: AssetType.Texture,
          url: new URL("../../../../../terrain/src/rock-formation/assets/tiny-glade-rocky-terrain.png", import.meta.url)
            .href,
          params: {
            isSRGBColorSpace: true,
            mipmap: true,
            wrapModeU: TextureWrapMode.Repeat,
            wrapModeV: TextureWrapMode.Repeat,
            filterMode: TextureFilterMode.Trilinear,
            anisoLevel: 4
          }
        })
        .then(resolve, reject);
    })
      .then((texture) => {
        next.texture = texture;
        return texture;
      })
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

export function bindPaintedRockMaterial(
  engine: Engine,
  material: PBRMaterial,
  textureScale = DEFAULT_ROCK_TEXTURE_SCALE,
  cellular = true
): void {
  const texture = textures.get(engine)?.texture;
  if (!texture) throw Error("Original painted rock texture must be prepared before publication");
  material.shaderData.setTexture("material_OriginalRockTexture", texture);
  setPaintedRockTextureScale(material, textureScale);
  if (cellular) material.shaderData.enableMacro(PAINTED_ROCK_MACRO);
  else material.shaderData.disableMacro(PAINTED_ROCK_MACRO);
  material.roughness = 0.8;
}

/** Only a shader uniform changes; texture, mesh and physics resources stay resident. */
export function setPaintedRockTextureScale(material: PBRMaterial, textureScale: number): void {
  material.shaderData.setFloat("material_OriginalRockTextureScale", textureScale);
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
  ShaderFactory.registerInclude(
    owned + "Attributes.glsl",
    attributes.replace(
      /struct Attributes\s*\{/,
      (match) => `${match}
    #ifdef ${PAINTED_ROCK_MACRO}
      vec4 TEXCOORD_2;
      vec4 TEXCOORD_3;
      vec4 TEXCOORD_4;
      vec4 TEXCOORD_5;
      vec2 TEXCOORD_6;
      vec3 TEXCOORD_7;
    #endif`
    )
  );
  ShaderFactory.registerInclude(
    owned + "Varyings.glsl",
    varyings.replace(
      /struct Varyings\s*\{/,
      (match) => `${match}
    #ifdef MATERIAL_TERRAIN_HEIGHT_FIELD
      float rockGroundClearance;
    #endif
    #ifdef ${PAINTED_ROCK_MACRO}
      vec4 rockBarycentrics;
      vec4 rockNeighbor0;
      vec4 rockNeighbor1;
      vec4 rockNeighbor2;
      vec2 rockCell;
      vec3 rockSmoothNormal;
    #endif`
    )
  );
  ShaderFactory.registerInclude(
    owned + "Forward.glsl",
    forward
      // The shared evaluator owns the PBR includes, once, in the private pass.
      .replace('"ShaderLibrary/PBR/LightDirectPBR.glsl"', '"shared/Lighting.glsl"')
      .replace('#include "ShaderLibrary/PBR/LightIndirectPBR.glsl"', "")
      .replace(attributeName, owned + "Attributes.glsl")
      .replace(varyingName, owned + "Varyings.glsl")
      .replace(
        vertexHook,
        `${vertexHook}
      #ifdef MATERIAL_TERRAIN_HEIGHT_FIELD
        varyings.rockGroundClearance = terrainProjectRockGroundClearance(vertexInputs.positionWS);
      #endif
      #ifdef ${PAINTED_ROCK_MACRO}
        varyings.rockBarycentrics = attributes.TEXCOORD_2;
        varyings.rockNeighbor0 = vec4(normalize(mat3(renderer_NormalMat) * attributes.TEXCOORD_3.xyz), attributes.TEXCOORD_3.w);
        varyings.rockNeighbor1 = vec4(normalize(mat3(renderer_NormalMat) * attributes.TEXCOORD_4.xyz), attributes.TEXCOORD_4.w);
        varyings.rockNeighbor2 = vec4(normalize(mat3(renderer_NormalMat) * attributes.TEXCOORD_5.xyz), attributes.TEXCOORD_5.w);
        varyings.rockCell = attributes.TEXCOORD_6;
        varyings.rockSmoothNormal = mat3(renderer_NormalMat) * attributes.TEXCOORD_7;
      #endif`
      )
  );
  ShaderFactory.registerInclude(owned + "CellularLighting.glsl", lighting);
  ShaderFactory.registerInclude(owned + "Original.glsl", surface);
}
