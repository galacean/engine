import type { AnimalTargetQuery, AnimalWorldEvent } from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";
import { AnimalQuery } from "@galacean/engine-animals/gameplay/animal/AnimalRegistration";
import type { AnimalDemoHabitats } from "./AnimalDemoHabitats.ts";

/** Query facts supplied by an animal instance; no render or skeleton dependencies. */
export interface AnimalDemoActor {
  id?: string;
  index: number;
  position: readonly [number, number];
  origin: readonly [number, number];
  /** Optional current heading, in radians. */
  heading?: number;
  /** Conservative instance footprint in metres, including animation envelopes. */
  radius?: number;
}

/** Reachable dry-ground queries for the flat test meadow. Seed can supply a different registry. */
export class AnimalDemoWorld {
  private readonly queries = new Map<
    string,
    (
      actor: AnimalDemoActor,
      params: Record<string, unknown>,
      event: AnimalWorldEvent | null
    ) => readonly [number, number] | null
  >();

  /** Register a bounded meadow, a visible riverbank, and a dry escape route. No swimming is implied. */
  constructor(
    private readonly random: () => number = Math.random,
    private readonly area = { minX: -19, maxX: 19, minZ: -12.4, maxZ: 15 },
    private readonly habitats?: AnimalDemoHabitats
  ) {
    this.register("riverbank", (actor) => {
      const radius = actor.radius ?? 0.5;
      // The nearest bank preserves the actor's lateral position. Index-based columns
      // sent actors across the entire herd, and packed large bodies into 1.3 m rows.
      return [
        Math.max(area.minX + radius + 0.3, Math.min(area.maxX - radius - 0.3, actor.position[0])),
        area.minZ + radius + 0.3
      ];
    });
    this.register("wander", (actor) => {
      if (habitats && actor.id) return habitats.wander(actor.id, actor.position, actor.heading ?? 0, random);
      const homeDistance = Math.hypot(actor.position[0] - actor.origin[0], actor.position[1] - actor.origin[1]);
      const direction =
        homeDistance > 4
          ? Math.atan2(actor.origin[0] - actor.position[0], actor.origin[1] - actor.position[1])
          : (actor.heading ?? random() * Math.PI * 2);
      const angle = direction + (random() - 0.5) * 0.9;
      return this.clamp([actor.position[0] + Math.sin(angle) * 12, actor.position[1] + Math.cos(angle) * 12]);
    });
    for (const query of [AnimalQuery.Food, AnimalQuery.FoodAtMouth])
      this.register(query, (actor) => habitats?.food(actor.position, query === AnimalQuery.FoodAtMouth) ?? null);
    this.register("flee", (actor, params, event) => {
      const source = event?.source ?? [0, 4];
      let dx = actor.position[0] - source[0],
        dz = actor.position[1] - source[1];
      const length = Math.hypot(dx, dz);
      if (length < 0.001) {
        const angle = actor.index * 2.4;
        dx = Math.sin(angle);
        dz = Math.cos(angle);
      } else {
        dx /= length;
        dz /= length;
      }
      const distance = Number(params.distance ?? 4);
      if (!Number.isFinite(distance) || distance <= 0) return null;
      const heading = Math.atan2(dx, dz);
      // A clamped outward ray can be almost zero at the meadow edge. Choose the
      // longest bounded escape, preferring directions away from the source.
      let best: readonly [number, number] | null = null,
        score = -Infinity;
      for (const offset of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
        const angle = heading + offset;
        const point = this.clamp(
          [actor.position[0] + Math.sin(angle) * distance, actor.position[1] + Math.cos(angle) * distance],
          actor.radius ?? 0
        );
        const travel = Math.hypot(point[0] - actor.position[0], point[1] - actor.position[1]);
        const value = travel - Math.abs(offset) * distance * 0.12;
        if (value > score) {
          score = value;
          best = point;
        }
      }
      return best;
    });
  }

  /** Register an application query; duplicate names fail instead of silently changing behavior. */
  register(
    name: string,
    resolve: (
      actor: AnimalDemoActor,
      params: Record<string, unknown>,
      event: AnimalWorldEvent | null
    ) => readonly [number, number] | null
  ): void {
    if (!name || this.queries.has(name)) throw new Error(`Duplicate animal world query: ${name}`);
    this.queries.set(name, resolve);
  }

  /** Unknown queries and non-finite or out-of-meadow results are unavailable. */
  resolve(
    query: AnimalTargetQuery,
    actor: AnimalDemoActor,
    event: AnimalWorldEvent | null
  ): readonly [number, number] | null {
    const result = this.queries.get(query.query)?.(actor, query.params ?? {}, event);
    if (
      !result ||
      !result.every(Number.isFinite) ||
      result[0] < this.area.minX ||
      result[0] > this.area.maxX ||
      result[1] < this.area.minZ ||
      result[1] > this.area.maxZ
    )
      return null;
    return result;
  }

  private clamp(point: readonly [number, number], radius = 0): readonly [number, number] {
    return [
      Math.max(this.area.minX + radius, Math.min(this.area.maxX - radius, point[0])),
      Math.max(this.area.minZ + radius, Math.min(this.area.maxZ - radius, point[1]))
    ];
  }
}
