import { Vector3 } from "@galacean/engine";

export type LampHDR = readonly [number, number, number];

/** Material parameters shared by one emitter and its receivers within a building instance. */
export class BuildingLampMaterial {
  readonly hdr: Vector3;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly lampId: string,
    readonly partId: string,
    readonly authoredHDR: LampHDR
  ) {
    this.hdr = new Vector3(...authoredHDR);
  }

  setHDR(rgb: LampHDR = this.authoredHDR): void {
    if (rgb.some((c) => !Number.isFinite(c) || c < 0)) throw Error("Lamp HDR requires finite nonnegative RGB");
    const [r, g, b] = rgb;
    if (this.hdr.x === r && this.hdr.y === g && this.hdr.z === b) return;
    this.hdr.set(r, g, b);
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
