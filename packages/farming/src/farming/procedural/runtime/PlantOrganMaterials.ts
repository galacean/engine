import { Color, Engine, Material, ModelMesh, MeshRenderer, PBRMaterial, Shader, Vector4 } from "@galacean/engine";
import source from "./PlantOrganTint.shader?plant-precompiled";
import { sampleColorCurve, type GrowthCurve, type PlantPoint } from "../core/curves";

/** COLOR_0.a selects tinted organs, not opacity. Tint inputs are sRGB. */
export interface PlantOrganAppearance {
  readonly progress: number | null;
  setProgress(value: number): void;
  setColor(color: Readonly<{ r: number; g: number; b: number }>): void;
  reset(): void;
}

export const ORGAN_TINT_PROPERTY = "renderer_OrganTint";

/** Instance-owned tint materials; renderer uniforms never mutate another plant. */
export class PlantOrganMaterials {
  private readonly materials = new Map<Material, PBRMaterial>();
  constructor(
    private readonly engine: Engine,
    private readonly colors: GrowthCurve<PlantPoint>
  ) {}

  bind(renderers: MeshRenderer[], isReleased: () => boolean): PlantOrganAppearance {
    for (const renderer of renderers) {
      if (
        !(renderer.mesh instanceof ModelMesh) ||
        !renderer.mesh.vertexElements.some((element) => element.semantic === "COLOR_0")
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
      }
      renderer.setMaterial(material);
      renderer.enableVertexColor = true;
      renderer.shaderData.setVector4(ORGAN_TINT_PROPERTY, new Vector4(1, 1, 1, 0));
    }
    const thisColors = this.colors;
    let progress: number | null = null;
    const assertLive = () => {
      if (isReleased()) throw new Error("植物实例已释放");
    };
    const setColor = (color: Readonly<{ r: number; g: number; b: number }>) => {
      assertLive();
      if (![color.r, color.g, color.b].every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
        throw new Error("部件颜色必须是 0..1 的 sRGB 数值");
      const tint = new Vector4(
        Color.gammaToLinearSpace(color.r),
        Color.gammaToLinearSpace(color.g),
        Color.gammaToLinearSpace(color.b),
        1
      );
      for (const renderer of renderers) renderer.shaderData.setVector4(ORGAN_TINT_PROPERTY, tint.clone());
      progress = null;
    };
    return {
      get progress() {
        return progress;
      },
      setColor,
      setProgress(value) {
        const color = sampleColorCurve(thisColors, value);
        setColor({ r: color[0], g: color[1], b: color[2] });
        progress = Math.max(0, Math.min(1, value));
      },
      reset() {
        assertLive();
        for (const renderer of renderers) renderer.shaderData.setVector4(ORGAN_TINT_PROPERTY, new Vector4(1, 1, 1, 0));
        progress = null;
      }
    };
  }

  dispose() {
    for (const material of this.materials.values()) material.destroy(true);
    this.materials.clear();
  }
}
