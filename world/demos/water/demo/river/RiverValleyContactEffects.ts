import type { WaterContactEffectSource } from "@galacean/engine-water/water/runtime/effects/index";
import type { RiverPathControlPoint } from "@galacean/engine-water/water/index";
import manifest from "../../assets/contact-effects/scene.json";

export { RIVER_VALLEY_CONTACT_EFFECTS_LOOK } from "@galacean/engine-water/water/presets/river/index";

export function createRiverValleyContactSources(points: readonly RiverPathControlPoint[]): WaterContactEffectSource[] {
  return manifest.emitters.map((emitter, index) => {
    const position = emitter.position;
    let distance = Infinity,
      samplePosition: [number, number, number] = [0, 0, 0],
      width = 1;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b.position[0] - a.position[0],
        dz = b.position[2] - a.position[2];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((position[0] - a.position[0]) * dx + (position[2] - a.position[2]) * dz) /
            Math.max(dx * dx + dz * dz, 0.00001)
        )
      );
      const p = a.position.map((v, j) => v + (b.position[j] - v) * t) as [number, number, number];
      const d = Math.hypot(p[0] - position[0], p[2] - position[2]);
      if (d < distance) {
        distance = d;
        samplePosition = p;
        width = (a.width! + (b.width! - a.width!) * t) * 0.35;
      }
    }
    // Whitewater lies on the rebuilt water surface. Original Unity heights can sit below it
    // after the explicit monotone-profile correction, so retain XZ and sample height in runtime.
    if (emitter.kind === "whitewater") samplePosition = [position[0], samplePosition[1], position[2]];
    return {
      id: emitter.id,
      kind: emitter.kind as WaterContactEffectSource["kind"],
      samplePosition,
      offset:
        emitter.kind === "whitewater"
          ? [0, 0, 0]
          : (position.map((v, i) => v - samplePosition[i]) as [number, number, number]),
      width,
      seed: index * 17 + 37
    };
  });
}
