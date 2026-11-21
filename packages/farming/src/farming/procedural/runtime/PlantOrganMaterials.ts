import {
  BufferMesh,
  Color,
  Engine,
  Material,
  ModelMesh,
  MeshRenderer,
  PBRMaterial,
  Shader,
  Vector4
} from "@galacean/engine";
import source from "./PlantOrganTint.shader?plant-precompiled";
import { sampleColorCurveInto, type GrowthCurve, type PlantPoint } from "../core/curves";

/** COLOR_0.a selects tinted organs, not opacity. Tint inputs are sRGB. */
export interface PlantOrganAppearance {
  readonly progress: number | null;
  setProgress(value: number): void;
  setColor(color: Readonly<{ r: number; g: number; b: number }>): void;
  reset(): void;
}

export const ORGAN_TINT_PROPERTY = "renderer_OrganTint";

function writeRendererOrganTint(renderers: readonly MeshRenderer[], r: number, g: number, b: number, a: number): void {
  for (let i = 0; i < renderers.length; i++) {
    const shaderData = renderers[i].shaderData;
    const existing = shaderData.getVector4(ORGAN_TINT_PROPERTY);
    if (existing) existing.set(r, g, b, a);
    else shaderData.setVector4(ORGAN_TINT_PROPERTY, new Vector4(r, g, b, a));
  }
}

/** Instance-owned tint materials; renderer uniforms never mutate another plant. */
export class PlantOrganMaterials {
  private readonly materials = new Map<Material, PBRMaterial>();
  constructor(
    private readonly engine: Engine,
    private readonly colors: GrowthCurve<PlantPoint>
  ) {}

  bind(renderers: MeshRenderer[], isReleased: () => boolean): PlantOrganAppearance {
    for (let i = 0; i < renderers.length; i++) {
      const renderer = renderers[i];
      const mesh = renderer.mesh;
      if (
        !(mesh instanceof ModelMesh || mesh instanceof BufferMesh) ||
        !mesh.vertexElements.some((element) => element.semantic === "COLOR_0")
      )
        throw new Error("部件着色需要 COLOR_0 遮罩");
      const original = renderer.getMaterial();
      if (!(original instanceof PBRMaterial)) throw new Error("部件着色需要 PBR 材质");
      let material = this.materials.get(original);
      if (!material || material.destroyed) {
        material = new PBRMaterial(this.engine);
        // Own the clone before registration can throw; factory cleanup must see it.
        this.materials.set(original, material);
        original.cloneTo(material);
        // Engine's bundled shader library uses this same precompiled instruction path.
        // The internal factory is omitted from the released declaration file.
        const precompiledShader = Shader as typeof Shader & { _createFromPrecompiled(data: typeof source): Shader };
        material.shader = Shader.find(source.name) ?? precompiledShader._createFromPrecompiled(source);
        material.name = "植物部件着色";
        // Cutout leaves retain their texture alpha; opaque queue avoids transparent sorting.
        material.isTransparent = false;
        material.screenSpaceReflectionIntensity = 0;
      }
      renderer.setMaterial(material);
      renderer.enableVertexColor = true;
      const existing = renderer.shaderData.getVector4(ORGAN_TINT_PROPERTY);
      if (existing) existing.set(1, 1, 1, 0);
      else renderer.shaderData.setVector4(ORGAN_TINT_PROPERTY, new Vector4(1, 1, 1, 0));
    }
    const thisColors = this.colors;
    const colorScratch: [number, number, number] = [1, 1, 1];
    let progress: number | null = null;
    const assertLive = () => {
      if (isReleased()) throw new Error("植物实例已释放");
    };
    const setColor = (color: Readonly<{ r: number; g: number; b: number }>) => {
      assertLive();
      if (
        !Number.isFinite(color.r) ||
        color.r < 0 ||
        color.r > 1 ||
        !Number.isFinite(color.g) ||
        color.g < 0 ||
        color.g > 1 ||
        !Number.isFinite(color.b) ||
        color.b < 0 ||
        color.b > 1
      )
        throw new Error("部件颜色必须是 0..1 的 sRGB 数值");
      writeRendererOrganTint(
        renderers,
        Color.gammaToLinearSpace(color.r),
        Color.gammaToLinearSpace(color.g),
        Color.gammaToLinearSpace(color.b),
        1
      );
      progress = null;
    };
    return {
      get progress() {
        return progress;
      },
      setColor,
      setProgress(value) {
        sampleColorCurveInto(thisColors, value, colorScratch);
        assertLive();
        writeRendererOrganTint(
          renderers,
          Color.gammaToLinearSpace(colorScratch[0]),
          Color.gammaToLinearSpace(colorScratch[1]),
          Color.gammaToLinearSpace(colorScratch[2]),
          1
        );
        progress = Math.max(0, Math.min(1, value));
      },
      reset() {
        assertLive();
        writeRendererOrganTint(renderers, 1, 1, 1, 0);
        progress = null;
      }
    };
  }

  dispose() {
    for (const material of this.materials.values()) material.destroy(true);
    this.materials.clear();
  }
}

/** Shared-material organ tint helper for runtime instances using Tier A materials directly. */
export function bindSharedPlantOrganTint(
  renderers: readonly MeshRenderer[],
  colors: GrowthCurve<PlantPoint>,
  isReleased: () => boolean
): PlantOrganAppearance {
  for (let i = 0; i < renderers.length; i++) {
    const renderer = renderers[i];
    const mesh = renderer.mesh;
    if (
      !(mesh instanceof ModelMesh || mesh instanceof BufferMesh) ||
      !mesh.vertexElements.some((element) => element.semantic === "COLOR_0")
    )
      throw new Error("部件着色需要 COLOR_0 遮罩");
    renderer.enableVertexColor = true;
    const existing = renderer.shaderData.getVector4(ORGAN_TINT_PROPERTY);
    if (existing) existing.set(1, 1, 1, 0);
    else renderer.shaderData.setVector4(ORGAN_TINT_PROPERTY, new Vector4(1, 1, 1, 0));
  }
  const colorScratch: [number, number, number] = [1, 1, 1];
  let progress: number | null = null;
  const assertLive = () => {
    if (isReleased()) throw new Error("植物实例已释放");
  };
  const setColor = (color: Readonly<{ r: number; g: number; b: number }>) => {
    assertLive();
    if (
      !Number.isFinite(color.r) ||
      color.r < 0 ||
      color.r > 1 ||
      !Number.isFinite(color.g) ||
      color.g < 0 ||
      color.g > 1 ||
      !Number.isFinite(color.b) ||
      color.b < 0 ||
      color.b > 1
    )
      throw new Error("部件颜色必须是 0..1 的 sRGB 数值");
    writeRendererOrganTint(
      renderers,
      Color.gammaToLinearSpace(color.r),
      Color.gammaToLinearSpace(color.g),
      Color.gammaToLinearSpace(color.b),
      1
    );
    progress = null;
  };
  return {
    get progress() {
      return progress;
    },
    setColor,
    setProgress(value) {
      sampleColorCurveInto(colors, value, colorScratch);
      assertLive();
      writeRendererOrganTint(
        renderers,
        Color.gammaToLinearSpace(colorScratch[0]),
        Color.gammaToLinearSpace(colorScratch[1]),
        Color.gammaToLinearSpace(colorScratch[2]),
        1
      );
      progress = Math.max(0, Math.min(1, value));
    },
    reset() {
      assertLive();
      writeRendererOrganTint(renderers, 1, 1, 1, 0);
      progress = null;
    }
  };
}
