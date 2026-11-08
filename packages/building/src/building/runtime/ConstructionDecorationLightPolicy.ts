import { constructionLanternColors } from "./ConstructionLanternShader";
import { DecorationMaterial } from "./ConstructionDecorationMaterial";
import type { ConstructionDecorationPart } from "./ConstructionDecorations";
export interface ConstructionDecorationLight {
  id: string;
  ownerId: string;
  /** Source attachment identity when emitted by an editable decoration. */
  decorationId?: string;
  position: [number, number, number];
  color: [number, number, number];
  intensity: number;
  range: number;
}
export interface ConstructionLightSlot {
  descriptor: ConstructionDecorationLight | null;
  weight: number;
}
/** Compiled decorations own emitter placement, including native point offsets
 * that differ from the shader filament after model scaling. Translation is
 * the published group/root translation, never an independent random transform. */
export function constructionDecorationLights(
  parts: readonly ConstructionDecorationPart[],
  translation: readonly number[] = [0, 0, 0]
): ConstructionDecorationLight[] {
  return parts.flatMap((part) => {
    if (part.kind !== "wall-lamp" && part.kind !== "lantern") return [];
    let intensity = 0,
      count = 0;
    const p: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < part.emission.length; i++)
      if (part.emission[i] > 0) {
        intensity += part.emission[i];
        count++;
        for (let c = 0; c < 3; c++)
          p[c] +=
            part.appearance?.kinds[i] === DecorationMaterial.lanternEmission
              ? part.appearance.centers[i * 3 + c]
              : part.positions[i * 3 + c];
      }
    if (!count) return [];
    for (let c = 0; c < 3; c++) p[c] = (part.lightPosition?.[c] ?? p[c] / count) + (translation[c] ?? 0);
    return [
      {
        id: part.id,
        ownerId: part.ownerId,
        ...(part.decorationId ? { decorationId: part.decorationId } : {}),
        position: p,
        color: [...constructionLanternColors[part.appearance?.colorIds[0] ?? 0]] as [number, number, number],
        intensity: intensity / count,
        range: 3.5
      }
    ];
  });
}
/** Selection deliberately ignores orientation/frustum/LOD. An incumbent keeps a
 * 20% distance advantage; changes fade through reusable slots rather than moving
 * a lit emitter abruptly to a different building. These are host budgets, not a
 * claim about Tiny Glade's original light culling or deferred shading. */
export class ConstructionDecorationLightPolicy {
  readonly slots: ConstructionLightSlot[];
  readonly budget: number;
  readonly enterDistance: number;
  readonly exitDistance: number;
  readonly fadeSeconds: number;
  /** Selection and slot fades have reached their target for the last inputs. */
  settled = false;
  constructor(budget = 4, enterDistance = 28, exitDistance = 34, fadeSeconds = 0.35) {
    this.budget = budget;
    this.enterDistance = enterDistance;
    this.exitDistance = exitDistance;
    this.fadeSeconds = fadeSeconds;
    if (
      !Number.isInteger(budget) ||
      budget < 1 ||
      budget > 8 ||
      !Number.isFinite(enterDistance) ||
      enterDistance <= 0 ||
      !Number.isFinite(exitDistance) ||
      exitDistance < enterDistance ||
      !Number.isFinite(fadeSeconds) ||
      fadeSeconds <= 0
    )
      throw Error("Invalid decoration light budget");
    this.slots = Array.from({ length: budget }, () => ({ descriptor: null, weight: 0 }));
  }
  update(
    lights: readonly ConstructionDecorationLight[],
    camera: readonly number[],
    deltaSeconds: number
  ): readonly ConstructionLightSlot[] {
    if (
      camera.length < 3 ||
      !camera.slice(0, 3).every(Number.isFinite) ||
      !Number.isFinite(deltaSeconds) ||
      deltaSeconds < 0
    )
      throw Error("Finite light camera/time required");
    const byId = new Map<string, ConstructionDecorationLight>();
    for (const l of lights) {
      if (
        !l.id ||
        byId.has(l.id) ||
        ![...l.position, ...l.color, l.intensity, l.range].every(Number.isFinite) ||
        l.intensity < 0 ||
        l.range <= 0 ||
        l.color.some((c) => c < 0)
      )
        throw Error("Invalid/duplicate decoration emitter " + l.id);
      byId.set(l.id, l);
    }
    const resident = new Set(this.slots.flatMap((s) => (s.descriptor ? [s.descriptor.id] : [])));
    const candidates = lights
      .map((l) => ({ l, d: Math.hypot(...l.position.map((v, i) => v - camera[i])) }))
      .filter(({ l, d }) => l.intensity > 0 && d < (resident.has(l.id) ? this.exitDistance : this.enterDistance));
    candidates.sort(
      (a, b) =>
        a.d * (resident.has(a.l.id) ? 0.8 : 1) - b.d * (resident.has(b.l.id) ? 0.8 : 1) || a.l.id.localeCompare(b.l.id)
    );
    const desired = candidates.slice(0, this.budget).map((c) => c.l),
      want = new Set(desired.map((l) => l.id));
    const step = Math.min(1, deltaSeconds / this.fadeSeconds);
    for (const slot of this.slots) {
      if (!slot.descriptor) continue;
      const latest = byId.get(slot.descriptor.id);
      // Explicit deletion/off is immediate; residency changes alone fade out.
      if (!latest || latest.intensity === 0) {
        slot.descriptor = null;
        slot.weight = 0;
        continue;
      }
      slot.descriptor = latest;
      slot.weight = Math.max(0, Math.min(1, slot.weight + (want.has(latest.id) ? step : -step)));
      if (!slot.weight && !want.has(latest.id)) slot.descriptor = null;
    }
    for (const light of desired) {
      if (this.slots.some((s) => s.descriptor?.id === light.id)) continue;
      const vacant = this.slots.find((s) => !s.descriptor);
      if (vacant) {
        vacant.descriptor = light;
        vacant.weight = step;
      }
    }
    this.settled =
      this.slots.every((s) => !s.descriptor || (want.has(s.descriptor.id) && s.weight === 1)) &&
      desired.every((l) => this.slots.some((s) => s.descriptor?.id === l.id));
    return this.slots;
  }
}
