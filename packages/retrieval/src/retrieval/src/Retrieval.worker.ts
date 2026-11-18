import { RetrievalLibrary } from "./library";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(value: WorkerResponse): void;
};
let library: RetrievalLibrary | undefined;
scope.onmessage = async ({ data }) => {
  try {
    let value: unknown;
    if (data.operation === "open") {
      if (library) throw new Error("Worker already owns a library snapshot");
      library = await RetrievalLibrary.open(data.input.manifestUrl);
      value = { corpusHash: library.corpusHash };
    } else {
      if (!library) throw new Error("Library is not open");
      switch (data.operation) {
        case "search":
          value = await library.searchAssets(data.input);
          break;
        case "descriptions":
          value = await library.readAssetDescriptions(data.input);
          break;
        case "text":
          value = await library.readText(data.input.path, { maxBytes: data.input.maxBytes });
          break;
        case "resources":
          value = await library.resourceSet(data.input.path);
          break;
        case "resolve":
          value = await library.resolveResource(data.input.path);
          break;
        default:
          throw new Error("Unknown retrieval operation");
      }
    }
    scope.postMessage({ id: data.id, ok: true, value });
  } catch (error) {
    scope.postMessage({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
