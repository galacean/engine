import { BaseMaterial, Color, PBRMaterial, Shader, Vector3 } from "@galacean/engine";
import source from "./CuteZooToon.shader?raw";
import outlinePass from "./CuteZooOutline.shader?raw";

/** Editable diffuse-only toon appearance; hexadecimal colors are authored in sRGB. */
export interface CuteZooToonAppearance {
  brightness: number;
  step: number;
  feather: number;
  shadeColor: string;
  secondShade: boolean;
  secondStep: number;
  secondColor: string;
  texture: boolean;
  rim: boolean;
  rimStrength: number;
  rimPower: number;
  rimColor: string;
  outline: boolean;
  outlineWidth: number;
  outlineColor: string;
}

/** Accepted original-package preset, independent of the world's exposure. */
export const CUTE_ZOO_TOON_APPEARANCE: Readonly<CuteZooToonAppearance> = Object.freeze({
  brightness: 1,
  step: 0.6,
  feather: 0.2,
  shadeColor: "#e2aeae",
  secondShade: false,
  secondStep: 0.3,
  secondColor: "#79688f",
  texture: true,
  rim: true,
  rimStrength: 0.35,
  rimPower: 3,
  rimColor: "#ffe5cf",
  outline: true,
  outlineWidth: 0.01,
  outlineColor: "#493b38"
});

function toonShader(outline: boolean): Shader {
  const name = outline ? "Animal/CuteZooToonOutlined" : "Animal/CuteZooToon";
  return (
    Shader.find(name) ??
    Shader.create(
      outline
        ? source
            .replace('"Animal/CuteZooToon"', `"${name}"`)
            .replace('    Pass "Forward" {', `${outlinePass}\n    Pass "Forward" {`)
        : source
    )
  );
}

function linearColor(hex: string): Vector3 {
  const value = Number.parseInt(hex.slice(1), 16);
  return new Vector3(
    ...([value >> 16, (value >> 8) & 255, value & 255].map((channel) => Color.sRGBToLinearSpace(channel / 255)) as [
      number,
      number,
      number
    ])
  );
}

/**
 * Apply an authored appearance once at creation or when its configuration changes.
 * @param material Owned toon material.
 * @param original Borrowed import supplying the optional color texture.
 * @param appearance Complete appearance; zero feather selects the hard-step shader variant.
 */
export function applyCuteZooToonAppearance(
  material: BaseMaterial,
  original: PBRMaterial,
  appearance: CuteZooToonAppearance
): void {
  const data = material.shaderData;
  const outline = appearance.outline && appearance.outlineWidth > 0;
  const shader = toonShader(outline);
  if (material.shader !== shader) material.shader = shader;
  if (outline) {
    data.setFloat("animal_OutlineWidth", appearance.outlineWidth);
    data.setVector3("animal_OutlineColor", linearColor(appearance.outlineColor));
  }
  if (appearance.rim && appearance.rimStrength > 0) {
    data.enableMacro("ANIMAL_TOON_RIM");
    data.setFloat("animal_RimStrength", appearance.rimStrength);
    data.setFloat("animal_RimPower", appearance.rimPower);
    data.setVector3("animal_RimColor", linearColor(appearance.rimColor));
  } else data.disableMacro("ANIMAL_TOON_RIM");
  data.setFloat("animal_Brightness", appearance.brightness);
  data.setFloat("animal_Step", appearance.step);
  data.setVector3("animal_ShadeColor", linearColor(appearance.shadeColor));
  if (appearance.feather > 0) {
    data.enableMacro("ANIMAL_TOON_FEATHER");
    data.setFloat("animal_Feather", appearance.feather);
  } else data.disableMacro("ANIMAL_TOON_FEATHER");
  if (appearance.secondShade) {
    data.enableMacro("ANIMAL_TOON_SECOND_SHADE");
    data.setFloat("animal_SecondStep", Math.min(appearance.secondStep, appearance.step));
    data.setVector3("animal_SecondShadeColor", linearColor(appearance.secondColor));
  } else data.disableMacro("ANIMAL_TOON_SECOND_SHADE");
  const texture = appearance.texture ? original.baseTexture : null;
  if (texture) {
    data.setTexture("material_BaseTexture", texture);
    data.enableMacro("MATERIAL_HAS_BASETEXTURE");
  } else data.disableMacro("MATERIAL_HAS_BASETEXTURE");
}

/**
 * Create a diffuse-only material borrowing the imported color texture and UV transform.
 * No PBR uniforms, normal/metal/roughness textures or PBR feature macros are cloned.
 * @param original Borrowed imported opaque material, retained unchanged in the resource cache.
 * @param appearance Initial toon controls.
 * @returns Caller-owned material; destroying it does not destroy the borrowed texture.
 */
export function createCuteZooToonMaterial(
  original: PBRMaterial,
  appearance: CuteZooToonAppearance = CUTE_ZOO_TOON_APPEARANCE
): BaseMaterial {
  const material = new BaseMaterial(original.engine, Shader.find("Animal/CuteZooToon") ?? Shader.create(source));
  material.name = `${original.name} / Toon`;
  material.renderFace = original.renderFace;
  material.alphaCutoff = original.alphaCutoff;
  material.shaderData.setColor("material_BaseColor", original.baseColor.clone());
  material.shaderData.setVector4("material_TilingOffset", original.tilingOffset.clone());
  applyCuteZooToonAppearance(material, original, appearance);
  return material;
}
