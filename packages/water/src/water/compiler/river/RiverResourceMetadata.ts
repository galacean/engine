import { createRiverCompiledTransfer } from "./RiverResourceTransfer";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import { hashRiverStableValue } from "../shared/determinism";
import type { RiverCompiledData } from "./types";

export interface RiverResourceMetadata {
  readonly descriptorHash: string;
  readonly compiledHash: string;
}

/** Computes persistent identity without encoding or retaining a transport envelope. */
export function createRiverResourceMetadata(
  descriptor: RiverNetworkDescriptor,
  data: RiverCompiledData
): RiverResourceMetadata {
  return Object.freeze({
    descriptorHash: hashRiverStableValue(descriptor),
    compiledHash: hashRiverStableValue(createRiverCompiledTransfer(data))
  });
}
