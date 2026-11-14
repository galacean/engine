import {
  RIVER_RESOURCE_SCHEMA_VERSION,
  createRiverCompiledTransfer,
  collectRiverTransferables
} from "./RiverResourceTransfer";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import { RiverNetworkCompiler } from "./RiverNetworkCompiler";
import { createRiverResourceMetadata } from "./RiverResourceMetadata";
import {
  RiverCompileWorkerMessageKind,
  type RiverCompileWorkerFailure,
  type RiverCompileWorkerRequest,
  type RiverCompileWorkerSuccess
} from "./RiverCompileWorkerProtocol";

interface RiverWorkerScope {
  onmessage: ((event: MessageEvent<RiverCompileWorkerRequest>) => void) | null;
  postMessage(message: RiverCompileWorkerSuccess | RiverCompileWorkerFailure, transfer?: Transferable[]): void;
}

const workerScope = typeof self === "undefined" ? undefined : (self as unknown as RiverWorkerScope);

export function executeRiverCompileWorkerRequest(request: RiverCompileWorkerRequest): {
  response: RiverCompileWorkerSuccess | RiverCompileWorkerFailure;
  transferables: ArrayBuffer[];
} {
  const result = RiverNetworkCompiler.compile(request.source);
  if (!result.data) {
    return {
      response: {
        kind: RiverCompileWorkerMessageKind.Failure,
        requestId: request.requestId,
        diagnostics: result.diagnostics
      },
      transferables: []
    };
  }
  // A successful compile proves that the unknown input decoded and passed semantic validation.
  const metadata = createRiverResourceMetadata(request.source as RiverNetworkDescriptor, result.data);
  const data = createRiverCompiledTransfer(result.data);
  return {
    response: {
      kind: RiverCompileWorkerMessageKind.Success,
      requestId: request.requestId,
      resource: { schemaVersion: RIVER_RESOURCE_SCHEMA_VERSION, data, metadata }
    },
    transferables: collectRiverTransferables(data)
  };
}
if (workerScope)
  workerScope.onmessage = (event): void => {
    if (event.data.kind !== RiverCompileWorkerMessageKind.Compile) return;
    const { response, transferables } = executeRiverCompileWorkerRequest(event.data);
    workerScope.postMessage(response, transferables);
  };
