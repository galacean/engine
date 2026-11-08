import { test } from "vitest";
import assert from "node:assert/strict";
import {
  ConstructionLoadError,
  constructionResponse,
  constructionBytes,
  constructionJSON
} from "../src/building/runtime/ConstructionLoadError.ts";

test("resource unavailability retries, missing resources remain actionable errors", async () => {
  const original = globalThis.fetch;
  const url = new URL("http://localhost/model.bin");
  try {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(
      constructionResponse(url),
      (e) => e instanceof ConstructionLoadError && e.retryable && e.cause instanceof TypeError
    );
    globalThis.fetch = async () => new Response("down", { status: 503 });
    await assert.rejects(constructionResponse(url), (e) => e.retryable && e.message.includes("503"));
    globalThis.fetch = async () => new Response("missing", { status: 404 });
    await assert.rejects(constructionResponse(url), (e) => !e.retryable && e.message.includes("404"));
  } finally {
    globalThis.fetch = original;
  }
});

test("resource transport includes body delivery while malformed JSON remains a permanent data error", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError("network ended during body"));
          }
        })
      );
    await assert.rejects(
      constructionBytes(new URL("https://example.invalid/resource")),
      (e) => e instanceof ConstructionLoadError && e.retryable && e.cause instanceof TypeError
    );
    globalThis.fetch = async () => new Response("{invalid");
    await assert.rejects(
      constructionJSON(new URL("https://example.invalid/library.json")),
      (e) => e instanceof SyntaxError && !(e instanceof ConstructionLoadError)
    );
  } finally {
    globalThis.fetch = original;
  }
});
