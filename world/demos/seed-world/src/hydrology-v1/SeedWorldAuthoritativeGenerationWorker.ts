import {
  buildSeedWorldAuthoritativeGenerationV1,
  createSeedWorldAuthoritativePresentationSourceV2,
  type SeedWorldAuthoritativeGenerationWorkerInputV1
} from "./SeedWorldAuthoritativeGenerationBuilderV1.ts";
import {
  seedWorldTransferredAuthoritativeGenerationTransferablesV1,
  transferSeedWorldAuthoritativeGenerationV1,
  type SeedWorldTransferredAuthoritativeGenerationV1
} from "./SeedWorldAuthoritativeGenerationTransferV1.ts";
import { prepareSeedWorldHeightBrushLibrary } from "@galacean/engine-terrain/world/SeedWorldHeightBrush";
import { SeedWorldUint16TilePool } from "@galacean/engine-world-planning/world/SeedWorldGridTileSnapshot";
import { compileSeedWorldWaterGenerationInWorkerV1 } from "./SeedWorldWaterGenerationWorkerV1.ts";

/** One authoritative generation request sent after the Worker startup handshake. */
export interface SeedWorldAuthoritativeGenerationWorkerRequestV1 {
  readonly kind: "build";
  /** Monotonic request identity owned by the client. */
  readonly id: number;
  /** Transfer-safe inputs consumed by the authoritative compiler. */
  readonly input: SeedWorldAuthoritativeGenerationWorkerInputV1;
}

/** Browser-resolved asset URL used to initialize the self-contained classic Worker. */
export interface SeedWorldAuthoritativeGenerationWorkerInitializationV1 {
  readonly kind: "initialize";
  readonly heightBrushUrl: string;
}

/** Message published by the authoritative compiler Worker during startup or after one build. */
export interface SeedWorldAuthoritativeGenerationWorkerResponseV1 {
  /** Startup handshake or completed-build response. */
  readonly kind: "ready" | "result";
  /** Request identity, or zero for the startup handshake. */
  readonly id: number;
  /** Transfer-safe completed generation payload. */
  readonly result?: SeedWorldTransferredAuthoritativeGenerationV1;
  /** Serializable build failure details. */
  readonly error?: Readonly<{ name: string; message: string }>;
}

const worker = self as unknown as {
  onmessage:
    | ((
        event: MessageEvent<
          SeedWorldAuthoritativeGenerationWorkerInitializationV1 | SeedWorldAuthoritativeGenerationWorkerRequestV1
        >
      ) => void)
    | null;
  postMessage(message: SeedWorldAuthoritativeGenerationWorkerResponseV1, transfer: Transferable[]): void;
  close(): void;
};

const heightTilePool = new SeedWorldUint16TilePool();
const ownershipTilePool = new SeedWorldUint16TilePool();

worker.onmessage = (event) => {
  if (event.data.kind === "initialize") {
    void prepareSeedWorldHeightBrushLibrary(new URL(event.data.heightBrushUrl)).then(
      () => worker.postMessage({ kind: "ready", id: 0 }, []),
      (error) =>
        worker.postMessage(
          {
            kind: "ready",
            id: 0,
            error: Object.freeze({
              name: error instanceof Error ? error.name : "Error",
              message: error instanceof Error ? error.message : String(error)
            })
          },
          []
        )
    );
    return;
  }
  const { id, input } = event.data;
  let build: ReturnType<typeof buildSeedWorldAuthoritativeGenerationV1> | undefined;
  try {
    build = buildSeedWorldAuthoritativeGenerationV1({
      ...input,
      heightTilePool,
      ownershipTilePool
    });
    const preparedWaterGeneration = compileSeedWorldWaterGenerationInWorkerV1(build, id);
    const preparedPresentationSource = createSeedWorldAuthoritativePresentationSourceV2(build, {
      clonePlannedFields: true
    });
    const result = transferSeedWorldAuthoritativeGenerationV1(
      build,
      preparedWaterGeneration,
      preparedPresentationSource
    );
    worker.postMessage(
      { kind: "result", id, result },
      seedWorldTransferredAuthoritativeGenerationTransferablesV1(result)
    );
  } catch (error) {
    worker.postMessage(
      {
        kind: "result",
        id,
        error: Object.freeze({
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error)
        })
      },
      []
    );
    // A failed build may have reached a compiler cache insertion point. Do not retain that Worker epoch.
    worker.close();
  } finally {
    build?.release();
  }
};
