import { Matrix, Vector3 } from "@galacean/engine";

export type SnapshotIdentity =
  | string
  | { byteLength: number; resolve(position: Readonly<Vector3>): string | undefined };

/** CPU-only immutable observation. No renderer, camera, project or published-world references. */
export class SeedWorldPickSnapshot {
  readonly byteLength: number;
  private disposed = false;
  constructor(
    readonly width: number,
    readonly height: number,
    private identities: Uint8Array,
    private depths: Uint8Array,
    private readonly objects: Map<number, SnapshotIdentity>,
    private readonly inverse: Matrix,
    private readonly viewport: readonly number[]
  ) {
    const regions = new Set<Exclude<SnapshotIdentity, string>>();
    let tableBytes = objects.size * 64;
    for (const value of objects.values()) {
      if (typeof value === "string") tableBytes += value.length * 2;
      else if (!regions.has(value)) {
        regions.add(value);
        tableBytes += value.byteLength;
      }
    }
    this.byteLength = identities.byteLength + depths.byteLength + tableBytes + 256;
  }

  point(x: number, y: number): { objectId?: string; position?: [number, number, number] } {
    if (this.disposed) throw new Error("Pick snapshot has been released");
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height)
      throw new Error("Pointer outside snapshot");
    const offset = (y * this.width + x) * 4;
    const id = this.identities[offset]! | (this.identities[offset + 1]! << 8) | (this.identities[offset + 2]! << 16);
    const identity = this.objects.get(id);
    if (!identity) return {};
    const depth =
      (this.depths[offset]! | (this.depths[offset + 1]! << 8) | (this.depths[offset + 2]! << 16)) / 0xffffff;
    const [vx, vy, vw, vh] = this.viewport;
    const position = new Vector3(
      (((x + 0.5) / this.width - vx) / vw) * 2 - 1,
      1 - (((y + 0.5) / this.height - vy) / vh) * 2,
      depth * 2 - 1
    );
    Vector3.transformCoordinate(position, this.inverse, position);
    return {
      objectId: typeof identity === "string" ? identity : identity.resolve(position),
      position: [position.x, position.y, position.z]
    };
  }

  dispose(): void {
    this.disposed = true;
    this.identities = this.depths = new Uint8Array(0);
    this.objects.clear();
  }
}
