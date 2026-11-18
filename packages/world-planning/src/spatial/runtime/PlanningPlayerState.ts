import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { SeedWorldPlayerState } from "../../world/SeedWorldPlayerState";
import { resolveSeedWorldCameraForward, type SeedWorldCameraBookmark } from "../../world/SeedWorldCameraBookmark";

export interface PlanningPlayerWorld {
  readonly seed: number;
  readonly width: number;
  readonly depth: number;
  readonly groundClearance: number;
  readonly allowOrbit: boolean;
  sampleHeight(x: number, z: number): number | undefined;
}

/** Reject an old centered-world pose outside the current planning domain; recover a buried roam pose. */
export function restorePlanningPlayerBookmark(
  bookmark: SeedWorldCameraBookmark | undefined,
  world: PlanningPlayerWorld
): SeedWorldCameraBookmark | undefined {
  if (!bookmark || (bookmark.mode === "orbit" && !world.allowOrbit)) return undefined;
  const [x, y, z] = bookmark.position;
  if (![x, y, z, bookmark.yawDegrees, bookmark.pitchDegrees].every(Number.isFinite)) return undefined;
  let targetX = x,
    targetZ = z;
  if (bookmark.mode === "orbit") {
    if (
      !bookmark.orbitDistanceMetres ||
      !Number.isFinite(bookmark.orbitDistanceMetres) ||
      bookmark.orbitDistanceMetres <= 0
    )
      return undefined;
    const direction = resolveSeedWorldCameraForward(bookmark.yawDegrees, bookmark.pitchDegrees);
    targetX += direction[0] * bookmark.orbitDistanceMetres;
    targetZ += direction[2] * bookmark.orbitDistanceMetres;
  }
  if (targetX < 0 || targetZ < 0 || targetX > world.width || targetZ > world.depth) return undefined;
  const ground = world.sampleHeight(targetX, targetZ);
  if (ground === undefined || !Number.isFinite(ground)) return undefined;
  return bookmark.mode === "roam"
    ? { ...bookmark, position: [x, Math.max(y, ground + world.groundClearance), z] }
    : bookmark;
}

/** Reuses Seed's debounced private player store; it never changes the shareable layout or URL. */
export class PlanningPlayerState {
  private state?: SeedWorldPlayerState;
  private seed?: number;
  constructor(
    private readonly storage: () => Pick<Storage, "getItem" | "setItem">,
    private readonly capture: () => SeedWorldCameraBookmark,
    private readonly restore: (bookmark: SeedWorldCameraBookmark) => void,
    private readonly onError: (error: unknown) => void = console.warn
  ) {}

  private readonly retired: SeedWorldPlayerState[] = [];

  /** Prepare private persistence; an entry with its own initial view can omit camera restoration. */
  prepare(
    world: PlanningPlayerWorld,
    options: { restoreCamera?: boolean } = {}
  ): PreparedPlanningPlayerState | undefined {
    if (this.seed === world.seed) return undefined;
    const state = new SeedWorldPlayerState(String(world.seed), this.storage, this.onError);
    const bookmark = options.restoreCamera === false ? undefined : restorePlanningPlayerBookmark(state.load(), world);
    let phase: "prepared" | "committed" | "finalized" | "rolled-back" = "prepared";
    let previousState: SeedWorldPlayerState | undefined;
    let previousSeed: number | undefined;
    return {
      bookmark,
      commit: () => {
        if (phase !== "prepared") throw new Error("Player state preparation is no longer active");
        previousState = this.state;
        previousSeed = this.seed;
        this.seed = world.seed;
        this.state = state;
        phase = "committed";
      },
      finalize: () => {
        if (phase !== "committed") return;
        phase = "finalized";
        if (previousState) this.retired.push(previousState);
        previousState = undefined;
        previousSeed = undefined;
      },
      rollback: () => {
        if (phase === "rolled-back" || phase === "finalized") return;
        if (phase === "committed") {
          this.state = previousState;
          this.seed = previousSeed;
        }
        previousState = undefined;
        previousSeed = undefined;
        phase = "rolled-back";
        state.dispose();
      }
    };
  }

  publish(world: PlanningPlayerWorld): void {
    const prepared = this.prepare(world);
    if (!prepared) return;
    prepared.commit();
    prepared.finalize();
    if (prepared.bookmark) this.restore(prepared.bookmark);
    this.observe();
  }
  observe(): void {
    for (const state of this.retired.splice(0))
      void state
        .flush()
        .catch(this.onError)
        .finally(() => state.dispose());
    this.state?.observe(this.capture());
  }
  async dispose(): Promise<void> {
    const state = this.state;
    this.state = undefined;
    const states = [...this.retired.splice(0), ...(state ? [state] : [])];
    await Promise.allSettled(
      states.map(async (value) => {
        try {
          await value.flush();
        } finally {
          value.dispose();
        }
      })
    );
  }
}

/** Prepared private state switches synchronously; persistence runs on observation or disposal. */
export interface PreparedPlanningPlayerState {
  readonly bookmark?: SeedWorldCameraBookmark;
  commit(): void;
  /** Retire the previous private store only after the entire scene has accepted. */
  finalize(): void;
  rollback(): void;
}

export interface PlanningPlayerCameraPose {
  readonly position: Vector3;
  readonly rotation: Quaternion;
  readonly orbitTarget?: Vector3;
}

/** Preserves the original roam/orbit bookmark pose without mutating active controls in preparation. */
export function planningPlayerCameraPose(bookmark: SeedWorldCameraBookmark): PlanningPlayerCameraPose {
  const [x, y, z] = bookmark.position;
  const direction = resolveSeedWorldCameraForward(bookmark.yawDegrees, bookmark.pitchDegrees);
  const position = new Vector3(x, y, z),
    rotation = new Quaternion(),
    matrix = new Matrix();
  Matrix.lookAt(
    position,
    new Vector3(x + direction[0], y + direction[1], z + direction[2]),
    new Vector3(0, 1, 0),
    matrix
  );
  matrix.invert();
  matrix.getRotation(rotation);
  const distance = bookmark.orbitDistanceMetres!;
  return {
    position,
    rotation,
    ...(bookmark.mode === "orbit"
      ? {
          orbitTarget: new Vector3(
            x + direction[0] * distance,
            y + direction[1] * distance,
            z + direction[2] * distance
          )
        }
      : {})
  };
}
