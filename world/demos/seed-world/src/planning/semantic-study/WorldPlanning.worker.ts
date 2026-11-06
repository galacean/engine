import {
  createPlanningWorkerRuntime,
  type PlanningWorkerRequest,
  type PlanningWorkerResponse
} from "./PlanningWorkerRuntime.ts";
export type { PlanningWorkerRequest, PlanningWorkerResponse } from "./PlanningWorkerRuntime.ts";
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<PlanningWorkerRequest>) => void) | null;
  postMessage(message: PlanningWorkerResponse): void;
};
const run = createPlanningWorkerRuntime((message) => worker.postMessage(message));
worker.onmessage = ({ data }) => run(data);
