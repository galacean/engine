import { constructionLanternColors } from "./ConstructionLanternShader";
import { DecorationMaterial } from "./ConstructionDecorationMaterial";
import type { ConstructionDecorationPart } from "./ConstructionDecorations";
export const DEFAULT_DECORATION_LIGHT_BUDGET = 4;

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
  private readonly _byId = new Map<string, ConstructionDecorationLight>();
  private readonly _resident = new Set<string>();
  private readonly _want = new Set<string>();
  private readonly _candidates: LightCandidate[] = [];
  private readonly _activeCandidates: LightCandidate[] = [];
  private readonly _compareCandidates = (a: LightCandidate, b: LightCandidate): number =>
    a.d * (this._resident.has(a.l.id) ? 0.8 : 1) - b.d * (this._resident.has(b.l.id) ? 0.8 : 1) ||
    a.l.id.localeCompare(b.l.id);
  constructor(budget = DEFAULT_DECORATION_LIGHT_BUDGET, enterDistance = 28, exitDistance = 34, fadeSeconds = 0.35) {
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
    camera: ArrayLike<number>,
    deltaSeconds: number
  ): readonly ConstructionLightSlot[] {
    if (
      camera.length < 3 ||
      !Number.isFinite(camera[0]) ||
      !Number.isFinite(camera[1]) ||
      !Number.isFinite(camera[2]) ||
      !Number.isFinite(deltaSeconds) ||
      deltaSeconds < 0
    )
      throw Error("Finite light camera/time required");
    // Per-call scratch collections are owned and cleared, keeping camera-driven selection allocation-free
    const byId = this._byId;
    byId.clear();
    for (let i = 0, n = lights.length; i < n; i++) {
      const l = lights[i];
      if (!l.id || byId.has(l.id) || !isValidLight(l)) throw Error("Invalid/duplicate decoration emitter " + l.id);
      byId.set(l.id, l);
    }
    const resident = this._resident;
    resident.clear();
    for (const slot of this.slots) if (slot.descriptor) resident.add(slot.descriptor.id);
    const candidates = this._candidates;
    const enterLimit2 = this.enterDistance * this.enterDistance;
    const exitLimit2 = this.exitDistance * this.exitDistance;
    const cx = camera[0],
      cy = camera[1],
      cz = camera[2];
    let count = 0;
    for (let i = 0, n = lights.length; i < n; i++) {
      const l = lights[i];
      if (!emitsLight(l)) continue;
      const limit2 = resident.has(l.id) ? exitLimit2 : enterLimit2;
      const dx = l.position[0] - cx,
        dy = l.position[1] - cy,
        dz = l.position[2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (!(d2 < limit2)) continue;
      const d = Math.sqrt(d2);
      const candidate = (candidates[count] ??= { l, d });
      candidate.l = l;
      candidate.d = d;
      count++;
    }
    for (let i = count; i < candidates.length; i++) candidates[i].l = null!;
    const active = this._activeCandidates;
    active.length = count;
    for (let i = 0; i < count; i++) active[i] = candidates[i];
    active.sort(this._compareCandidates);
    const desiredCount = Math.min(this.budget, count);
    const want = this._want;
    want.clear();
    for (let i = 0; i < desiredCount; i++) want.add(active[i].l.id);
    const step = Math.min(1, deltaSeconds / this.fadeSeconds);
    for (const slot of this.slots) {
      if (!slot.descriptor) continue;
      const latest = byId.get(slot.descriptor.id);
      // Explicit deletion/off is immediate; residency changes alone fade out.
      if (!latest || !emitsLight(latest)) {
        slot.descriptor = null;
        slot.weight = 0;
        continue;
      }
      slot.descriptor = latest;
      slot.weight = Math.max(0, Math.min(1, slot.weight + (want.has(latest.id) ? step : -step)));
      if (!slot.weight && !want.has(latest.id)) slot.descriptor = null;
    }
    for (let i = 0; i < desiredCount; i++) {
      const light = active[i].l;
      if (this._slotOf(light.id)) continue;
      const vacant = this._vacantSlot();
      if (vacant) {
        vacant.descriptor = light;
        vacant.weight = step;
      }
    }
    let settled = true;
    for (const slot of this.slots) {
      if (slot.descriptor && !(want.has(slot.descriptor.id) && slot.weight === 1)) settled = false;
    }
    for (let i = 0; settled && i < desiredCount; i++) if (!this._slotOf(active[i].l.id)) settled = false;
    this.settled = settled;
    active.length = 0;
    return this.slots;
  }

  private _slotOf(id: string): ConstructionLightSlot | undefined {
    for (const slot of this.slots) if (slot.descriptor?.id === id) return slot;
    return undefined;
  }

  private _vacantSlot(): ConstructionLightSlot | undefined {
    for (const slot of this.slots) if (!slot.descriptor) return slot;
    return undefined;
  }
}

interface LightCandidate {
  l: ConstructionDecorationLight;
  d: number;
}

function emitsLight(light: ConstructionDecorationLight): boolean {
  return light.intensity > 0 && (light.color[0] > 0 || light.color[1] > 0 || light.color[2] > 0);
}

function isValidLight(l: ConstructionDecorationLight): boolean {
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(l.position[i]) || !Number.isFinite(l.color[i]) || l.color[i] < 0) return false;
  }
  return Number.isFinite(l.intensity) && Number.isFinite(l.range) && l.intensity >= 0 && l.range > 0;
}
