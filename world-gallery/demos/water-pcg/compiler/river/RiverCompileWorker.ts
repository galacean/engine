import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import { RiverNetworkCompiler } from "./RiverNetworkCompiler";
import { serializeRiverResource } from "./RiverResourceSerializer";
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

const workerScope = self as unknown as RiverWorkerScope;

workerScope.onmessage = (event): void => {
  const request = event.data;
  if (request.kind !== RiverCompileWorkerMessageKind.Compile) return;
  const result = RiverNetworkCompiler.compile(request.source);
  if (!result.data) {
    workerScope.postMessage({
      kind: RiverCompileWorkerMessageKind.Failure,
      requestId: request.requestId,
      diagnostics: result.diagnostics
    });
    return;
  }
  // A successful compile proves that the unknown input decoded and passed semantic validation.
  const serialized = serializeRiverResource(request.source as RiverNetworkDescriptor, result.data);
  const resourceBytes = serialized.bytes.buffer.slice(
    serialized.bytes.byteOffset,
    serialized.bytes.byteOffset + serialized.bytes.byteLength
  ) as ArrayBuffer;
  workerScope.postMessage(
    {
      kind: RiverCompileWorkerMessageKind.Success,
      requestId: request.requestId,
      resourceBytes
    },
    [resourceBytes]
  );
};
