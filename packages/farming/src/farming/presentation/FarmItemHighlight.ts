import { Material, MeshRenderer, PBRMaterial, Shader } from "@galacean/engine";
import { Vector4 } from "@galacean/engine-math";
import { FARM_ITEM_HIGHLIGHT_SHADER } from "./FarmItemHighlightShader";

interface SharedHighlight {
  material: PBRMaterial;
  users: number;
}
const shared = new WeakMap<Material, SharedHighlight>();

export const FARM_ITEM_WARNING_SECONDS = 1.2;
/** Three pulses: 200ms red fade, 200ms original material; a new rejection restarts the sequence. */
export function farmItemWarningStrength(elapsed: number): number {
  if (elapsed < 0 || elapsed >= FARM_ITEM_WARNING_SECONDS) return 0;
  const phase = elapsed % 0.4;
  return phase < 0.2 ? (1 + Math.cos((phase * Math.PI) / 0.2)) / 2 : 0;
}

/** Same renderers, meshes and passes for ground gold and carried-item warning feedback.
 * Clones are shared across instances; original prefab materials and label atlases stay untouched.
 */
export class FarmItemHighlight {
  private readonly bindings: {
    renderer: MeshRenderer;
    original: (Material | null)[];
    highlighted: (Material | null)[];
  }[] = [];
  private readonly leases = new Map<Material, SharedHighlight>();
  private visible = false;
  private warningStrength = -1;
  private readonly tint = new Vector4();
  private disposed = false;

  constructor(renderers: readonly MeshRenderer[]) {
    for (const renderer of renderers) {
      if (renderer.entity.name === "SeedSackLabel") continue;
      const original = [...renderer.getMaterials()];
      const highlighted = original.map((source) => {
        if (!(source instanceof PBRMaterial)) return source;
        let entry = this.leases.get(source);
        if (!entry) {
          entry = shared.get(source);
          if (!entry) {
            const shader = Shader.find("Farming/ItemRimLight") ?? Shader.create(FARM_ITEM_HIGHLIGHT_SHADER);
            const material = source.clone();
            material.shader = shader;
            entry = { material, users: 0 };
            shared.set(source, entry);
          }
          entry.users++;
          this.leases.set(source, entry);
        }
        return entry.material;
      });
      this.bindings.push({ renderer, original, highlighted });
    }
  }
  get active(): boolean {
    return this.visible;
  }
  update(visible: boolean, warningStrength = 0): void {
    if (this.disposed) return;
    const strength = Math.max(0, Math.min(1, warningStrength));
    const highlighted = visible || strength > 0;
    if (this.warningStrength !== strength) {
      this.warningStrength = strength;
      if (strength > 0) this.tint.set(1, 0.015, 0.005, 5 * strength);
      else this.tint.set(1, 0.52, 0.035, 1.65);
      for (const binding of this.bindings) binding.renderer.shaderData.setVector4("renderer_ItemHighlight", this.tint);
    }
    if (this.visible === highlighted) return;
    this.visible = highlighted;
    for (const binding of this.bindings)
      binding.renderer.setMaterials(highlighted ? binding.highlighted : binding.original);
  }
  dispose(): void {
    if (this.disposed) return;
    this.update(false);
    this.disposed = true;
    for (const [source, entry] of this.leases) {
      if (--entry.users === 0) {
        shared.delete(source);
        entry.material.destroy();
      }
    }
    this.leases.clear();
    this.bindings.length = 0;
  }
}
