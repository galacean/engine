/** Lightweight live-animal boundary. Importing these types never loads models or the simulation. */
export interface SeedWorldAnimalQuery {
  typeId?: string;
  visible?: boolean;
  offset?: number;
  limit?: number;
}

/** A planned identity remains discoverable while its presentation is unloaded. */
export interface SeedWorldAnimalSummary {
  id: string;
  typeId: string;
  label: string;
  loaded: boolean;
  visible: boolean;
  position: readonly [number, number, number];
}

/** Host-owned semantic target query; callers discover its parameters through describe. */
export interface SeedWorldAnimalTarget {
  query: string;
  params?: Record<string, string | number | boolean>;
}

/** Stable request identity makes retries idempotent; a fresh identity explicitly restarts an intent. */
export interface SeedWorldAnimalCommand {
  id: string;
  requestId: string;
  skillId: string;
  target?: SeedWorldAnimalTarget;
}

/** An accepted command has not necessarily reached its goal. Rejected/unavailable is never success. */
export interface SeedWorldAnimalReceipt {
  id: string;
  requestId: string;
  skillId?: string;
  target?: SeedWorldAnimalTarget;
  status: "accepted" | "running" | "completed" | "cancelled" | "failed" | "rejected" | "not_found";
  reason?: string;
}

/** Semantic capabilities only; animation clip names, weights and behavior nodes stay inside the system. */
export interface SeedWorldAnimalDescription {
  id: string;
  available: boolean;
  reason?: string;
  skills: readonly {
    skillId: string;
    label: string;
    repeat: boolean;
    background: boolean;
    requiresTarget: boolean;
  }[];
  targets: readonly {
    query: string;
    label: string;
    description: string;
    parameters?: readonly {
      name: string;
      type: "string" | "number" | "boolean";
      required: boolean;
      description: string;
    }[];
  }[];
}

/** Lightweight available-content lookup; never downloads GLBs or starts the simulation. */
export interface SeedWorldAnimalCatalogQuery {
  search?: string;
  pack?: "cute-zoo" | "low-poly-100";
  offset?: number;
  limit?: number;
}

/** Registered visual identity; callers select type/appearance, never supply arbitrary resource URLs. */
export interface SeedWorldAnimalCatalogEntry {
  typeId: string;
  label: string;
  aliases: readonly string[];
  pack: "cute-zoo" | "low-poly-100";
  /** Biological species shared by model/pack variants; never a promised scene count. */
  speciesId: string;
  modelUrl: string;
  appearances: readonly { id: string; label: string; modelUrl: string }[];
}

/** One session-only addition. Replaying requestId cannot create a duplicate animal. */
export interface SeedWorldAnimalSpawn {
  requestId: string;
  typeId: string;
  appearanceId?: string;
  /** Optional exact horizontal position in metres; omission searches near the current observer. */
  position?: { x: number; z: number };
}

/** Admission is separate from successful asynchronous model loading; query the returned id. */
export interface SeedWorldAnimalSpawnReceipt {
  requestId: string;
  status: "accepted" | "rejected";
  id?: string;
  typeId?: string;
  appearanceId?: string;
  reason?: string;
}

/** One host service shared by UI and Agent. Query/describe/receipt must not trigger resource loading. */
export interface SeedWorldAnimalService {
  catalog(input: SeedWorldAnimalCatalogQuery): {
    entries: readonly SeedWorldAnimalCatalogEntry[];
    matchedCount: number;
    offset: number;
    nextOffset?: number;
  };
  spawn(input: SeedWorldAnimalSpawn): SeedWorldAnimalSpawnReceipt;
  query(input: SeedWorldAnimalQuery): {
    enabled: boolean;
    animals: readonly SeedWorldAnimalSummary[];
    matchedCount: number;
    offset: number;
    nextOffset?: number;
  };
  describe(input: { id: string }): SeedWorldAnimalDescription;
  command(input: SeedWorldAnimalCommand): SeedWorldAnimalReceipt;
  receipt(input: { id: string; requestId: string }): SeedWorldAnimalReceipt;
}
