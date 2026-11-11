import { masonrySourcePalette } from "./MasonryColorRules";
/** Scene preview colors are independent of the authored texture-layer IDs.
 * One state per Engine also covers buildings streamed in after a color change. */
export const masonryTintRoles = ["brick", "roof_tile", "wooden_plank"] as const;
export type MasonryTintRole = (typeof masonryTintRoles)[number];
export const masonryRoleTexture = {
  brick: "brick_colors",
  roof_tile: "roof_colors",
  wooden_plank: "timberframe"
} as const;
export function masonryTextureRole(name: string): MasonryTintRole | undefined {
  if (name === "brick_colors" || name === "plaster_colors" || name === "mortar") return "brick";
  if (name === "roof_colors") return "roof_tile";
  if (name === "timberframe") return "wooden_plank";
}
export const masonryTintUniforms = [
  "material_MasonryBrickTint",
  "material_MasonryRoofTint",
  "material_MasonryWoodTint"
];
export const masonryTintGLSL = `${masonryTintUniforms.map((name) => `uniform vec4 ${name};`).join("\n")}
vec4 masonryMaterialOverride(float role) {
  if (role < 0.0) return vec4(1.0,1.0,1.0,0.0);
  if (role < 0.5) return material_MasonryBrickTint;
  if (role < 1.5) return material_MasonryRoofTint;
  return material_MasonryWoodTint;
}
vec3 masonryMaterialTint(float role,vec3 sourceColor) {
  vec4 tint=masonryMaterialOverride(role);
  return tint.a > 0.5 ? tint.rgb : sourceColor;
}`;

export const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const luminance = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722;

class MasonryAppearance {
  private seed = 0;
  private palettes = new Map<string, Float32Array>();
  private layers: Partial<Record<MasonryTintRole, number>> = {};
  private colors: Partial<Record<MasonryTintRole, string>> = {};
  private referenceColors: Partial<Record<MasonryTintRole, string>> = {};
  referenceSeed?: number;
  private listeners = new Set<() => void>();
  get paletteSeed() {
    return this.seed;
  }
  registerSourceColors(name: string, colors: Float32Array) {
    if (this.palettes.get(name) === colors) return;
    this.palettes.set(name, colors);
    this.updateReferenceColors();
    for (const notify of this.listeners) notify();
  }
  textureColors(name: string, source: Float32Array, colorOverride = false): Float32Array {
    const role = masonryTextureRole(name);
    if (role && this.isOverridden(role)) {
      const color = colorOverride ? this.linearColor(role) : [1, 1, 1];
      return Float32Array.from(Array.from({ length: source.length / 4 }, () => [...color, 1]).flat());
    }
    return masonrySourcePalette(source, this.seed);
  }
  /** Distant geometry has an original average Color instead of a sampled texture. */
  previewColor(role: MasonryTintRole, layer: number, original: readonly number[]): number[] {
    if (this.isOverridden(role)) return this.linearColor(role);
    const source = this.palettes.get(masonryRoleTexture[role]);
    if (!source || !this.seed) return [...original];
    const selected = masonrySourcePalette(source, this.seed),
      index = Math.min(source.length / 4 - 1, layer) * 4;
    return original.map((value, i) =>
      source[index + i] > 0 ? (value * selected[index + i]) / source[index + i] : selected[index + i]
    );
  }
  setSeed(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error("Invalid masonry palette seed");
    this.seed = seed;
    this.colors = {};
    this.updateReferenceColors();
    for (const notify of this.listeners) notify();
  }
  /** With no owner, alpha zero keeps the original source-color fallback. */
  tint(role: MasonryTintRole): [number, number, number, number] {
    if (this.isOverridden(role)) return [...this.linearColor(role), 1];
    return [1, 1, 1, 0];
  }
  color(role: MasonryTintRole) {
    return this.colors[role] ?? this.referenceColors[role] ?? "#ffffff";
  }
  isOverridden(role: MasonryTintRole) {
    return this.colors[role] !== undefined;
  }
  /** The chip previews one building; every owner retains its own seeded Colors. */
  registerSourceReference(seed: number, layers: Partial<Record<MasonryTintRole, number>> = {}) {
    if (this.referenceSeed !== undefined) return;
    this.referenceSeed = seed;
    this.layers = layers;
    this.updateReferenceColors();
    for (const notify of this.listeners) notify();
  }
  private updateReferenceColors() {
    if (this.referenceSeed === undefined) return;
    for (const role of masonryTintRoles) {
      const source = this.palettes.get(masonryRoleTexture[role]);
      if (!source) continue;
      const colors = masonrySourcePalette(source, this.seed),
        offset = (this.layers[role] ?? 0) * 4;
      this.referenceColors[role] =
        "#" +
        Array.from(colors.subarray(offset, offset + 3))
          .map((v) =>
            Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255)
              .toString(16)
              .padStart(2, "0")
          )
          .join("");
    }
  }
  reset() {
    this.colors = {};
    for (const notify of this.listeners) notify();
  }
  linearColor(role: MasonryTintRole): [number, number, number] {
    const hex = this.color(role);
    return [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  }
  setColor(role: MasonryTintRole, value: string) {
    if (!masonryTintRoles.includes(role) || !/^#[\da-f]{6}$/i.test(value)) throw Error("Invalid masonry color");
    value = value.toLowerCase();
    if (this.colors[role] === value) return;
    this.colors[role] = value;
    for (const notify of this.listeners) notify();
  }
  subscribe(notify: () => void) {
    this.listeners.add(notify);
    notify();
    return {
      destroy: () => {
        this.listeners.delete(notify);
      }
    };
  }
}
const appearances = new WeakMap<object, MasonryAppearance>();
export function masonryAppearance(engine: object) {
  let appearance = appearances.get(engine);
  if (!appearance) appearances.set(engine, (appearance = new MasonryAppearance()));
  return appearance;
}

/** Only actual albedo maps are whitened. Normal, roughness, damage and glass
 * classification textures retain their original channels and compression. */
export function isMasonryBaseTexture(name: string) {
  return ["brick_colors", "roof_colors", "timberframe", "plaster_colors", "mortar"].includes(name);
}
export function masonryFamilyTint(family: string): MasonryTintRole | undefined {
  if (family === "brick" || family === "plaster") return "brick";
  if (family === "roof") return "roof_tile";
  if (family === "wood" || family === "wood-gable" || family === "wood-arch" || family === "frame")
    return "wooden_plank";
}
/** Decode the recovered G-buffer albedo first, then tint in linear light before
 * host lighting. Remove residual authored clay/moss hues without changing relief. */
export interface MasonryBaseBinding {
  sampler: string;
  layers: number;
  array: boolean;
}
export function masonryBaseColorUniform(sampler: string) {
  return "material_MasonryBaseColors_" + sampler;
}
export function injectMasonryTint(fragment: string, bindings: readonly MasonryBaseBinding[] = []) {
  const boundary = "v*=v;";
  if (!fragment.includes(boundary)) throw Error("Missing masonry linear albedo boundary");
  let helpers = "uniform vec4 material_MasonryTint;\n";
  helpers += "vec4 masonryResolvedTint(){return material_MasonryTint;}\n";
  fragment = restoreMasonryTextureSamples(fragment, bindings);
  return fragment
    .replace("void original_main()", helpers + "void original_main()")
    .replace(
      boundary,
      boundary +
        "vec4 masonryTint=masonryResolvedTint();if(masonryTint.a>0.5){v=vec3(dot(v,vec3(.2126,.7152,.0722)))*masonryTint.rgb;}"
    );
}

/** Gray texture samples recover their own source Color before the original
 * material calculations. Works in native, plaster and decoration shaders. */
export function restoreMasonryTextureSamples(fragment: string, bindings: readonly MasonryBaseBinding[]): string {
  for (const { sampler, layers, array } of bindings) {
    const sample = new RegExp("\\btexture\\(\\s*" + sampler + "\\s*,\\s*", "g");
    const grad = new RegExp("\\btextureGrad\\(\\s*" + sampler + "\\s*,\\s*", "g");
    if (!sample.test(fragment) && !grad.test(fragment)) continue;
    sample.lastIndex = grad.lastIndex = 0;
    fragment = fragment.replace(sample, `masonrySample_${sampler}(`).replace(grad, `masonryGrad_${sampler}(`);
    const type = array ? "vec3" : "vec2",
      layer = array ? `clamp(int(floor(uv.z+0.5)),0,${layers - 1})` : "0";
    const uniform = masonryBaseColorUniform(sampler);
    const helpers = `
uniform vec4 ${uniform}[${layers}];
vec4 masonryRestore_${sampler}(vec4 base,${type} uv){base.rgb*=${uniform}[${layer}].rgb;return base;}
vec4 masonrySample_${sampler}(${type} uv,float bias){return masonryRestore_${sampler}(texture(${sampler},uv,bias),uv);}
vec4 masonrySample_${sampler}(${type} uv){return masonrySample_${sampler}(uv,0.0);}
vec4 masonryGrad_${sampler}(${type} uv,vec2 dx,vec2 dy){return masonryRestore_${sampler}(textureGrad(${sampler},uv,dx,dy),uv);}
`;
    const declaration = new RegExp("(uniform\\s+(?:highp\\s+)?sampler2D(?:Array)?\\s+" + sampler + "\\s*;)");
    if (!declaration.test(fragment)) throw Error("Missing masonry texture declaration: " + sampler);
    fragment = fragment.replace(declaration, "$1" + helpers);
  }
  return fragment;
}

export function masonrySourceColorAt(colors: readonly number[], neutral: readonly number[], vertex: number): number[] {
  const i = vertex * 3,
    gray = neutral[i];
  return gray > 0 ? colors.slice(i, i + 3).map((v) => v / gray) : [1, 1, 1];
}
/** Opaque proxy COLOR.a carries the role and a bounded white-point fraction. */
export function masonryVertexTintTag(role: number, color: readonly number[], neutral: readonly number[]): number {
  if (role < 0) return 0;
  const gray = neutral[0],
    white = gray > 0 ? luminance(color[0], color[1], color[2]) / gray : 0;
  return role + 1 + white / (1 + white);
}

/** Decoration mesh colors are already linear. Keep the original arrays intact
 * for source parity and leave glass/emission out of material tinting. */
export function whiteMasonryVertexColors(colors: readonly number[], tintMask?: readonly boolean[]): number[] {
  const values = Array.from({ length: colors.length / 3 }, (_, i) =>
    luminance(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2])
  );
  const white = values.reduce((a, b, i) => (tintMask?.[i] === false ? a : Math.max(a, b)), 0);
  return values.flatMap((v, i) =>
    tintMask?.[i] === false ? colors.slice(i * 3, i * 3 + 3) : Array(3).fill(white > 0 ? v / white : v)
  );
}
