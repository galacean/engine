import {vi} from "vitest";
import {ProjectRegexScanner} from "../src/project-files/project-regex-scanner";
import type {RegexRequest} from "../src/project-files/project-regex-protocol";
export class TestWorker {
  static instances: TestWorker[] = [];
  static stall: "ready" | "reply" | undefined;
  onmessage?: (event: {data: unknown}) => void;
  onerror?: (event: unknown) => void;
  onmessageerror?: () => void;
  private scanner?: ProjectRegexScanner;
  private closed = false;
  terminate = vi.fn(() => { this.closed = true; });
  constructor() {
    TestWorker.instances.push(this);
    queueMicrotask(() => { if (!this.closed && TestWorker.stall !== "ready") this.onmessage?.({data: {type: "ready"}}); });
  }
  postMessage(data: RegexRequest) {
    queueMicrotask(() => {
      if (this.closed || TestWorker.stall === "reply") return;
      try {
        if (data.type === "compile") this.scanner = new ProjectRegexScanner(data.query, data.caseSensitive);
        const hits = data.type === "chunk" ? this.scanner!.push(data.text, data.first, data.end, data.limit) : [];
        this.onmessage?.({data: {type: "result", hits}});
      } catch (error) { this.onmessage?.({data: {type: "error", message: String(error)}}); }
    });
  }
}
