import type { SeedWorldPopulationInstance } from "./SeedWorldPopulationPlan.ts";

export class PopulationInstanceClearanceIndex {
  readonly #cellSizeMetres = 4;
  readonly #sizeMetres: number;
  readonly #cells = new Map<string, Array<Readonly<{ x: number; z: number; radius: number }>>>();
  #maximumRadiusMetres = 0;

  constructor(sizeMetres: number, instances: readonly SeedWorldPopulationInstance[]) {
    this.#sizeMetres = sizeMetres;
    for (const instance of instances) this.add(instance);
  }

  add(instance: SeedWorldPopulationInstance): void {
    const entry = this.#entry(instance);
    this.#maximumRadiusMetres = Math.max(this.#maximumRadiusMetres, entry.radius);
    const key = this.#key(entry.x, entry.z);
    const cell = this.#cells.get(key);
    if (cell) cell.push(entry);
    else this.#cells.set(key, [entry]);
  }

  overlaps(instance: SeedWorldPopulationInstance): boolean {
    const entry = this.#entry(instance);
    const cellX = Math.floor(entry.x / this.#cellSizeMetres);
    const cellZ = Math.floor(entry.z / this.#cellSizeMetres);
    const range = Math.ceil((entry.radius + this.#maximumRadiusMetres) / this.#cellSizeMetres);
    for (let offsetZ = -range; offsetZ <= range; offsetZ++) {
      for (let offsetX = -range; offsetX <= range; offsetX++) {
        for (const other of this.#cells.get(`${cellX + offsetX}:${cellZ + offsetZ}`) ?? []) {
          if (Math.hypot(entry.x - other.x, entry.z - other.z) < entry.radius + other.radius) return true;
        }
      }
    }
    return false;
  }

  #entry(instance: SeedWorldPopulationInstance): Readonly<{ x: number; z: number; radius: number }> {
    return Object.freeze({
      x: (instance.normalizedPosition.x - 0.5) * this.#sizeMetres,
      z: (instance.normalizedPosition.y - 0.5) * this.#sizeMetres,
      radius: Math.max(instance.footprintMetres[0], instance.footprintMetres[1]) * 0.5
    });
  }

  #key(x: number, z: number): string {
    return `${Math.floor(x / this.#cellSizeMetres)}:${Math.floor(z / this.#cellSizeMetres)}`;
  }
}
