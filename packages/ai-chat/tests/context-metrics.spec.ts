import { afterEach, expect, it, vi } from "vitest";
import { normalizeModelTelemetry } from "../src/ai-chat/context-metrics";
import { formatContextTrace } from "../src/ai-chat/context-trace";
import { requestAsapChat } from "../src/ai-chat/asap-chat";

const serverEstimate = {
  source: "asap" as const,
  scope: "prepared-request" as const,
  modelName: "deployment",
  method: "asap-utf8-v1",
  inputTokens: 60,
  requestTokens: 60,
  imageTokens: 0,
  imageCount: 0,
  messageCount: 2,
  tokensPerImage: 4096
};

afterEach(() => vi.unstubAllGlobals());

it("validates server observations without depending on a local counting algorithm", () => {
  expect(normalizeModelTelemetry({ modelName: "alias", inputEstimate: serverEstimate })!.inputEstimate).toEqual(
    serverEstimate
  );
  // The method is server-owned; swapping its estimator does not require a frontend tokenizer.
  const another = { ...serverEstimate, method: "another-server-estimator", tokensPerImage: 1024 };
  expect(normalizeModelTelemetry({ modelName: "alias", inputEstimate: another })!.inputEstimate).toEqual(another);
  for (const bad of [
    { ...serverEstimate, method: "" },
    { ...serverEstimate, inputTokens: 61 },
    { ...serverEstimate, source: "provider" },
    { ...serverEstimate, imageCount: -1 },
    { ...serverEstimate, requestTokens: "60" },
    { ...serverEstimate, inputTokens: Infinity },
    { ...serverEstimate, imageCount: 1 }
  ]) {
    expect(normalizeModelTelemetry({ modelName: "alias", inputEstimate: bad })!.inputEstimate).toBeUndefined();
  }
});

it("keeps missing, invalid and zero usage distinct; cache never reduces input occupancy", () => {
  expect(normalizeModelTelemetry({ modelName: "route" })).toEqual({ modelName: "route" });
  expect(
    normalizeModelTelemetry({
      modelName: "route",
      inputLimitTokens: 0,
      maxOutputTokens: -1,
      usage: { source: "estimated", inputTokens: 99 }
    })
  ).toEqual({ modelName: "route" });
  expect(
    normalizeModelTelemetry({
      modelName: "route",
      usage: { source: "provider", inputTokens: 10, outputTokens: 0, cachedInputTokens: 11, totalTokens: NaN }
    })
  ).toEqual({ modelName: "route", usage: { source: "provider", inputTokens: 10, outputTokens: 0 } });
  expect(
    normalizeModelTelemetry({ modelName: "route", usage: { source: "provider", inputTokens: true, outputTokens: "4" } })
  ).toEqual({ modelName: "route" });
});

it("shows unknown pending counts even when request text or a stale local estimate exists", () => {
  const summary = formatContextTrace([
    {
      elapsedMilliseconds: 0,
      event: {
        type: "model_request",
        step: 1,
        attempt: 1,
        messages: [{ role: "user", content: "x".repeat(10000) }],
        contextEstimate: { inputTokens: 777 }
      }
    }
  ]);
  expect(summary).toContain("1.1 | 未提供 | 未提供");
  expect(summary).not.toContain("777");
  expect(summary).not.toContain("本地预览");
});

it("pairs server estimates and actual usage per attempt without duplicating terminal snapshots", () => {
  const telemetry = {
    modelName: "alias",
    inputLimitTokens: 100,
    inputEstimate: serverEstimate,
    usage: { source: "provider", inputTokens: 40, outputTokens: 0, cachedInputTokens: 30 }
  };
  const attempt = { attempt: 1, error: null, telemetry };
  const finished = { type: "model_finished", step: { step: 1, attempts: [attempt] } };
  const summary = formatContextTrace([
    { elapsedMilliseconds: 0, event: { type: "model_request", step: 1, attempt: 1 } },
    { elapsedMilliseconds: 1, event: finished },
    { elapsedMilliseconds: 2, event: { type: "task_completed", result: { steps: [finished.step] } } }
  ]);
  expect(summary.match(/1\.1 \|/g)).toHaveLength(1);
  expect(summary).toContain("1.1 | ~60 | 40 | 0 | 30 | +20");
  expect(summary).toContain("ASAP 估算 60.0%；实际 40.0%");
  expect(summary).toContain("asap-utf8-v1");
  expect(summary).toContain("请求模型：deployment");
});

it("shows usage without an estimate and never borrows counts from another attempt", () => {
  const summary = formatContextTrace([
    {
      elapsedMilliseconds: 0,
      event: {
        type: "model_finished",
        step: {
          step: 1,
          attempts: [
            {
              attempt: 1,
              error: null,
              telemetry: {
                modelName: "alias",
                inputLimitTokens: 100,
                usage: { source: "provider", inputTokens: 0, outputTokens: 0 }
              }
            }
          ]
        }
      }
    }
  ]);
  expect(summary).toContain("1.1 | 未提供 | 0 | 0 | 未提供 | 未提供");
  expect(summary).toContain("ASAP 估算 未提供；实际 0.0%");
  const pending = formatContextTrace([
    {
      elapsedMilliseconds: 0,
      event: {
        type: "model_finished",
        step: {
          step: 1,
          attempts: [{ attempt: 1, error: null, telemetry: { modelName: "alias", inputEstimate: serverEstimate } }]
        }
      }
    },
    { elapsedMilliseconds: 1, event: { type: "model_request", step: 2, attempt: 1 } }
  ]);
  expect(pending).toContain("2.1 | 未提供 | 未提供");
  expect(pending).toContain("模型路由：未提供");
});

it("preserves server observations through the existing SDK envelope", async () => {
  const telemetry = {
    modelName: "server-route",
    inputLimitTokens: 1000,
    maxOutputTokens: 100,
    usage: { source: "provider", inputTokens: 55, outputTokens: 7, cachedInputTokens: 0 },
    inputEstimate: serverEstimate
  };
  vi.stubGlobal("window", {
    location: { hostname: "example.com" },
    lingguang: {
      ai: {
        streamChat: async (request: any) => ({
          content: JSON.stringify({
            type: "lingguang_ai_chat_stream_result_bridge",
            version: 1,
            nonce: request.responseFormat.params.streamResponseNonce,
            result: { content: "done", finishReason: "stop", telemetry }
          })
        })
      }
    }
  });
  await expect(
    requestAsapChat({
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      debugMode: false,
      signal: new AbortController().signal
    })
  ).resolves.toMatchObject({ content: "done", telemetry });
});
