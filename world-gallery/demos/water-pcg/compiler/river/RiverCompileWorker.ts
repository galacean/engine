import { decodeRiverNetworkDescriptor } from "../../authoring/river/RiverSchemaDecoder";
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
  const decoding = decodeRiverNetworkDescriptor(request.source);
  const result = RiverNetworkCompiler.compile(request.source);
  if (!decoding.value || !result.data) {
    workerScope.postMessage({
      kind: RiverCompileWorkerMessageKind.Failure,
      requestId: request.requestId,
      diagnostics: result.diagnostics
    });
    return;
  }
  const serialized = serializeRiverResource(decoding.value, result.data);
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
