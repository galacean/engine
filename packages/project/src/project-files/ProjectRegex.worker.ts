import { ProjectRegexScanner } from "./project-regex-scanner";
import type { RegexReply, RegexRequest } from "./project-regex-protocol";

let scanner: ProjectRegexScanner | undefined;
const send = (reply: RegexReply) => globalThis.postMessage(reply);
globalThis.onmessage = ({ data }: MessageEvent<RegexRequest>) => {
  try {
    if (data.type === "compile") {
      scanner = new ProjectRegexScanner(data.query, data.caseSensitive);
      send({ type: "result", hits: [] });
    } else {
      if (!scanner) throw new Error("Regex not initialized");
      send({ type: "result", hits: scanner.push(data.text, data.first, data.end, data.limit) });
    }
  } catch (error) {
    send({ type: "error", message: String(error instanceof Error ? error.message : error).slice(0, 240) });
  }
};
send({ type: "ready" });
