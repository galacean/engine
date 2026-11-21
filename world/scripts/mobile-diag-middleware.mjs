import fs from "node:fs";
import path from "node:path";

export const DEFAULT_MOBILE_DIAG_MAX_BODY_BYTES = 4 * 1024 * 1024;

function readExistingLines(diagLog) {
  if (!fs.existsSync(diagLog)) return [];
  return fs
    .readFileSync(diagLog, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

/**
 * Connect/Vite middleware receiving Seed World opt-in perf captures (`?debug=1&panel=1`).
 * Decodes full UTF-8 byte buffers before parsing, re-serializes every POST into canonical
 * single-line JSONL, and keeps `count` consistent with the persisted log file across restarts.
 */
export function createMobileDiagMiddleware(options) {
  const { diagLog, root, maxBodyBytes = DEFAULT_MOBILE_DIAG_MAX_BODY_BYTES, log = console.log } = options;
  const relativeLog = root ? path.relative(root, diagLog) || diagLog : diagLog;
  let persistedCount = null;

  const ensurePersistedCount = () => {
    if (persistedCount === null) {
      try {
        persistedCount = readExistingLines(diagLog).length;
      } catch {
        persistedCount = 0;
      }
    }
    return persistedCount;
  };

  return (req, res) => {
    const sendJson = (statusCode, payload) => {
      if (res.writableEnded) return;
      res.statusCode = statusCode;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(payload));
    };

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "GET") {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const rawTail = Number(parsedUrl.searchParams.get("tail") || "20");
      const tail = Math.max(1, Math.min(200, Number.isFinite(rawTail) && rawTail > 0 ? Math.floor(rawTail) : 20));
      let lines;
      try {
        lines = readExistingLines(diagLog);
        persistedCount = lines.length;
      } catch (error) {
        sendJson(500, { ok: false, file: relativeLog, error: String(error) });
        return;
      }
      const records = lines.slice(-tail).map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });
      sendJson(200, { ok: true, file: relativeLog, count: lines.length, records });
      return;
    }

    if (req.method === "DELETE") {
      try {
        if (fs.existsSync(diagLog)) {
          fs.unlinkSync(diagLog);
        }
        persistedCount = 0;
        sendJson(200, { ok: true, file: relativeLog, cleared: true });
      } catch (error) {
        sendJson(500, { ok: false, file: relativeLog, error: String(error) });
      }
      return;
    }

    if (req.method !== "POST") {
      sendJson(405, { ok: false, error: `Method '${req.method || ""}' not allowed` });
      return;
    }

    const chunks = [];
    let byteLength = 0;
    let aborted = false;

    req.on("error", (error) => {
      if (aborted) return;
      aborted = true;
      sendJson(400, { ok: false, error: String(error) });
    });

    req.on("data", (chunk) => {
      if (aborted) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += buf.byteLength;
      if (byteLength > maxBodyBytes) {
        aborted = true;
        sendJson(413, { ok: false, error: "Payload too large" });
        return;
      }
      chunks.push(buf);
    });

    req.on("end", () => {
      if (aborted) return;
      const trimmed = Buffer.concat(chunks, byteLength).toString("utf8").trim();
      if (!trimmed) {
        sendJson(400, { ok: false, error: "Empty payload" });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        sendJson(400, { ok: false, error: "Invalid JSON payload" });
        return;
      }
      try {
        const nextCount = ensurePersistedCount() + 1;
        fs.mkdirSync(path.dirname(diagLog), { recursive: true });
        // Re-serialize to canonical single-line JSON so multi-line payloads never corrupt JSONL.
        fs.appendFileSync(diagLog, JSON.stringify(parsed) + "\n", "utf8");
        persistedCount = nextCount;
        log?.(`[seed-world-perf-diag] saved #${persistedCount} -> ${relativeLog}`);
        sendJson(200, { ok: true, file: relativeLog, count: persistedCount });
      } catch (error) {
        sendJson(500, { ok: false, error: String(error) });
      }
    });
  };
}
