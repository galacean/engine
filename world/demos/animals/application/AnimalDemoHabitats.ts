import {
  AnimalHabitat,
  type AnimalSpeciesRegistration
} from "@galacean/engine-animals/gameplay/animal/AnimalRegistration";

/** A labelled test area; these tags do not simulate temperature, humidity or an actual biome. */
export interface AnimalDemoHabitatRegion {
  habitat: AnimalHabitat;
  name: string;
  color: string;
  min: readonly [number, number];
  max: readonly [number, number];
}
/** Test food affordance; availability gates presentation, without pretending to consume world resources. */
export interface AnimalDemoFoodPatch {
  center: readonly [number, number];
  radius: number;
  color: string;
}

/** Application-owned flat test regions, independent of source assets and the shared behavior executor. */
const REGION_SCALE = 1.25;
export const ANIMAL_DEMO_REGIONS: readonly AnimalDemoHabitatRegion[] = (
  [
    { habitat: AnimalHabitat.Waterside, name: "水岸", color: "#94b7a0", min: [-27, -24.4], max: [-0.8, -8.4] },
    { habitat: AnimalHabitat.Cold, name: "寒冷区", color: "#d5ddd6", min: [0.8, -24.4], max: [27, -8.4] },
    { habitat: AnimalHabitat.Grassland, name: "草地区", color: "#a8be83", min: [-27, -7.8], max: [-0.8, 8.8] },
    { habitat: AnimalHabitat.Woodland, name: "林地区", color: "#87a485", min: [0.8, -7.8], max: [27, 8.8] },
    { habitat: AnimalHabitat.Arid, name: "干地区", color: "#c7b48e", min: [-27, 9.4], max: [-0.8, 27] },
    { habitat: AnimalHabitat.Settlement, name: "聚落区", color: "#b7b594", min: [0.8, 9.4], max: [27, 27] }
  ] as AnimalDemoHabitatRegion[]
).map((r) => ({
  ...r,
  min: [r.min[0] * REGION_SCALE, r.min[1] * REGION_SCALE],
  max: [r.max[0] * REGION_SCALE, r.max[1] * REGION_SCALE]
}));

interface Occupant {
  region: AnimalDemoHabitatRegion;
  position: readonly [number, number];
  radius: number;
}
const halton = (n: number, base: number) => {
  let value = 0,
    fraction = 1;
  while (n > 0) {
    fraction /= base;
    value += fraction * (n % base);
    n = Math.floor(n / base);
  }
  return value;
};

/** Spawn spacing and habitat/food facts for the inspection scene; dynamic avoidance is deliberately separate. */
export class AnimalDemoHabitats {
  readonly regions = ANIMAL_DEMO_REGIONS;
  readonly foodPatches: readonly AnimalDemoFoodPatch[] = [
    { center: [-14, 0], radius: 4, color: "#679348" },
    { center: [14, 0], radius: 4, color: "#63874b" },
    { center: [14, 18], radius: 4, color: "#d3ba73" },
    { center: [-14, 18], radius: 3, color: "#839854" },
    { center: [-14, -16], radius: 3, color: "#c1bb83" },
    { center: [14, -16], radius: 3, color: "#8bb6bd" }
  ];
  foodEnabled = true;
  private readonly occupants = new Map<string, Occupant>();

  /**
   * Plan a complete initial population before loading instances. Retry the whole packing on fragmentation,
   * never omit individual actors or move already running instances.
   * @param entries Instance identities, habitat preferences and conservative metre-space footprints.
   * @param random Injectable random stream for repeatable placement.
   * @returns All positions, or an explicit capacity failure with no partial population retained.
   */
  spawnAll(
    entries: readonly { id: string; species: AnimalSpeciesRegistration; radius: number }[],
    random: () => number = Math.random
  ): ReadonlyMap<string, readonly [number, number]> {
    if (this.occupants.size) throw new Error("Population is already placed");
    if (
      new Set(entries.map((e) => e.id)).size !== entries.length ||
      entries.some((e) => !(e.radius > 0) || !Number.isFinite(e.radius))
    )
      throw new Error("Invalid initial population");
    const ordered = [...entries].sort((a, b) => b.radius - a.radius);
    for (let attempt = 0; attempt < 32; attempt++) {
      this.occupants.clear();
      const positions = new Map<string, readonly [number, number]>();
      try {
        for (const entry of ordered) positions.set(entry.id, this.spawn(entry.id, entry.species, entry.radius, random));
        return positions;
      } catch {
        // Different weighted habitat choices can free capacity without changing any model's scale.
      }
    }
    this.occupants.clear();
    throw new Error("Insufficient preferred habitat capacity for the complete population");
  }

  /**
   * Select a preferred region and place a body disc without overlap at initialisation.
   * @param id Stable actor ID.
   * @param species Authored habitat weights, not source model names.
   * @param radius Calibrated instance body radius in metres.
   * @param random Shared injectable random source for weighted region choice.
   * @returns A reachable spawn position; exhaustion is reported instead of overlapping another actor.
   */
  spawn(
    id: string,
    species: AnimalSpeciesRegistration,
    radius: number,
    random: () => number = Math.random
  ): readonly [number, number] {
    if (this.occupants.has(id) || !Number.isFinite(radius) || radius <= 0)
      throw new Error(`Invalid habitat spawn: ${id}`);
    const choices = species.habitats
      .filter((h) => h.weight > 0)
      .map((h) => ({ region: this.regions.find((r) => r.habitat === h.habitat)!, weight: h.weight }));
    while (choices.length) {
      let value = random() * choices.reduce((n, c) => n + c.weight, 0);
      let choice = choices.findIndex((c) => (value -= c.weight) < 0);
      if (choice < 0) choice = choices.length - 1;
      const { region } = choices.splice(choice, 1)[0];
      for (let attempt = 0; attempt < 512; attempt++) {
        const n = this.occupants.size + attempt * 101 + 1;
        const position: [number, number] = [
          region.min[0] + radius + 0.2 + halton(n, 2) * (region.max[0] - region.min[0] - 2 * radius - 0.4),
          region.min[1] + radius + 0.2 + halton(n, 3) * (region.max[1] - region.min[1] - 2 * radius - 0.4)
        ];
        if (
          [...this.occupants.values()].some(
            (o) => Math.hypot(position[0] - o.position[0], position[1] - o.position[1]) < radius + o.radius + 0.3
          )
        )
          continue;
        this.occupants.set(id, { region, position, radius });
        return position;
      }
    }
    throw new Error(`No free preferred habitat position: ${id}`);
  }

  /** Habitat selected at registration; unknown actors have no implied habitat. */
  region(id: string): AnimalDemoHabitatRegion | undefined {
    return this.occupants.get(id)?.region;
  }

  /** Bound an autonomous destination to the actor's selected habitat, including its body radius. */
  wander(
    id: string,
    position: readonly [number, number],
    heading: number,
    random: () => number
  ): readonly [number, number] | null {
    const actor = this.occupants.get(id);
    if (!actor) return null;
    const homeDistance = Math.hypot(position[0] - actor.position[0], position[1] - actor.position[1]);
    const direction =
      homeDistance > 4 ? Math.atan2(actor.position[0] - position[0], actor.position[1] - position[1]) : heading;
    const angle = direction + (random() - 0.5) * 0.9;
    return [
      Math.max(
        actor.region.min[0] + actor.radius,
        Math.min(actor.region.max[0] - actor.radius, position[0] + Math.sin(angle) * 12)
      ),
      Math.max(
        actor.region.min[1] + actor.radius,
        Math.min(actor.region.max[1] - actor.radius, position[1] + Math.cos(angle) * 12)
      )
    ];
  }

  /** Query test food, optionally requiring the actor to be within feeding reach. */
  food(
    position: readonly [number, number],
    atMouth: boolean
  ): readonly [number, number] | null {
    if (!this.foodEnabled) return null;
    let best: AnimalDemoFoodPatch | undefined,
      distance = Infinity;
    for (const patch of this.foodPatches) {
      const d = Math.hypot(position[0] - patch.center[0], position[1] - patch.center[1]);
      if ((!atMouth || d <= patch.radius) && d < distance) {
        best = patch;
        distance = d;
      }
    }
    if (!best) return null;
    if (atMouth) return position;
    // Choose a nearby edge inside the patch rather than making every actor aim at its centre.
    if (distance < best.radius * 0.6) return position;
    const ratio = (best.radius * 0.6) / Math.max(distance, 0.001);
    return [
      best.center[0] + (position[0] - best.center[0]) * ratio,
      best.center[1] + (position[1] - best.center[1]) * ratio
    ];
  }
}
