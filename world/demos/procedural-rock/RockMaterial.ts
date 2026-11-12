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
import shadowReceiver from "./ShadowReceiver.glsl?raw";
import surface from "./Projection.glsl?raw";
import shader from "./Rock.shader?raw";
import colorBlend from "./ColorBlend.glsl?raw";
import { registerSurfaceShaders, scopeIncludes } from "./SurfaceShaders";

interface RockColorBlend {
  color: [number, number, number];
}
const defaultColor: RockColorBlend = {
  color: [184, 188, 194].map((value) => Color.sRGBToLinearSpace(value / 255)) as [number, number, number]
};
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
      load(new URL("./assets/marble_cliff_05_disp_1k.png", import.meta.url), true),
      load(new URL("./assets/marble_cliff_05_nor_gl_1k.png", import.meta.url), false)
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
  textureScale = 0,
  colorBlend: RockColorBlend = defaultColor
): PBRMaterial {
  const texture = textures.get(engine)?.value;
  if (!texture) throw Error("Rock textures must be prepared before publication");
  registerRockSurfaceIncludes();
  const material = new PBRMaterial(engine);
  try {
    material.shader =
      Shader.find("ProceduralRock/Surface") ??
      Shader.create(scopeIncludes(shader.replaceAll("SeedWorld/RockSurface", "ProceduralRock/Surface")));
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
    material.shaderData.setVector3("material_RockColor", new Vector3(...colorBlend.color));
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
  settings: { textureScale: number; colorBlend: RockColorBlend }
): void {
  const texture = textures.get(engine)?.value;
  if (texture) material.shaderData.setTexture("material_OriginalRockTexture", texture.base);
  setRockTextureScale(material, settings.textureScale);
  material.shaderData.setVector3("material_RockColor", new Vector3(...settings.colorBlend.color));
}

/** Private PBR includes preserve the engine's global structs and other materials. */
export function registerRockSurfaceIncludes(): void {
  registerSurfaceShaders();
  for (const [name, source] of [
    ["ShadowReceiver.glsl", shadowReceiver],
    ["ColorBlend.glsl", colorBlend]
  ]) {
    if (!ShaderFactory.includeMap["ProceduralRock/Surface/" + name])
      ShaderFactory.registerInclude("ProceduralRock/Surface/" + name, scopeIncludes(source));
  }
  const forwardName = "ShaderLibrary/PBR/ForwardPassPBR.glsl";
  const attributeName = "ShaderLibrary/Common/Attributes.glsl";
  const varyingName = "ShaderLibrary/PBR/VaryingsPBR.glsl";
  const vertexHook = "varyings.positionWS = vertexInputs.positionWS;";
  const owned = "ProceduralRock/Surface/";
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
    scopeIncludes(
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
    )
  );
  ShaderFactory.registerInclude(owned + "Projection.glsl", scopeIncludes(surface));
}
