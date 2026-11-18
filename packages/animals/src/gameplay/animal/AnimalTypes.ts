import type { Entity, Signal, Vector3 } from "@galacean/engine";

/** Semantic controls shared by the playground and an AI tool adapter. */
export type AnimalCommand =
  | { requestId: string; action: "summon"; entry: "sky" | "ground" }
  | { requestId: string; action: "come"; greeting?: "prank" | "gentle" }
  | { requestId: string; action: "dismiss" }
  | { requestId: string; action: "dismount" }
  | { requestId: string; action: "behavior"; behavior: "free" | "stay" | "follow" }
  | { requestId: string; action: "temperament"; temperament: "cheeky" | "gentle" }
  | { requestId: string; action: "gait"; gait: "walk" | "gallop" };

/** Mutable ground query output; metres in the host's world coordinate system. */
export interface AnimalGround {
  height: number;
  grass: boolean;
}

/** Reused riding input: forward is throttle (1), coast (0), brake (-1); turn is signed rein input. */
export interface AnimalRideInput {
  forward: number;
  /** Host-selected cruising speed in metres per second; omitted uses the mount profile. */
  cruiseSpeed?: number;
  /** Host-selected sprint speed in metres per second. */
  sprintSpeed?: number;
  /** Optional gait requested by an input gesture; omitted selects from actual movement speed. */
  gait?: "walk" | "run";
  /** Hold to override the configured gait with gallop; omitted means no override. */
  sprint?: boolean;
  turn: number;
  dismount: boolean;
}

/** Host-owned world and player services; the animal never accesses DOM or Seed internals. */
export interface AnimalHost {
  readonly playerMoved: Signal<[]>;
  /** Write the player's ground anchor in metres into out. */
  readPlayerPosition(out: Vector3): void;
  /** Write the player's horizontal viewing direction into out. */
  readPlayerForward(out: Vector3): void;
  /** Write ground properties; false means out of bounds, water, or otherwise unsupported ground. */
  sampleGround(x: number, z: number, out: AnimalGround): boolean;
  /** Acquire/release riding control; false preserves the previous owner. */
  setRiding(riding: boolean, position: Readonly<Vector3>, yaw: number): boolean;
  /** Whether the host is still handing the camera and rider between riding and walking. */
  isRiderTransitioning?(): boolean;
  /** Write current local riding controls without allocation. */
  readRideInput(out: AnimalRideInput): void;
  /** Update the mounted player's anchor; camera smoothing belongs to the host. */
  updateRider(position: Readonly<Vector3>, yaw: number): void;
  /** Consume the final saddle pose after Animator evaluation and root-motion correction. */
  updateRiderPose?(deltaTime: number): void;
}

/** One observable gameplay occurrence, tagged with its owning operation. */
export interface AnimalEvent {
  type: string;
  requestId: string | null;
  actionId: number;
  detail: string;
}

/** A command acknowledgement; accepted does not mean the visible action has completed. */
export interface AnimalReceipt {
  requestId: string;
  status: "accepted" | "completed" | "cancelled" | "rejected";
  detail: string;
}

/** A compact copy of current state and counters, suitable for UI or AI inspection. */
export interface AnimalSnapshot {
  present: boolean;
  mounted: boolean;
  state: string;
  position: readonly [number, number, number];
  yaw: number;
  behavior: "free" | "stay" | "follow";
  temperament: "cheeky" | "gentle";
  gait: "walk" | "gallop";
  onGrass: boolean;
  operation: AnimalReceipt | null;
  counters: { decisions: number; groundQueries: number; mounts: number };
}

/** Public runtime facade consumed by the demo; mounting is deliberately local interaction. */
export interface AnimalRuntime {
  readonly events: Signal<[AnimalEvent]>;
  readonly entity: Entity;
  execute(command: AnimalCommand): AnimalReceipt;
  inspect(): AnimalSnapshot;
  dispose(): void;
}
