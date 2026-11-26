import { afterEach, expect, it, vi } from "vitest";
import { requestSceneGenerationChat } from "../../demos/seed-world/dev/scene-visual-intent/SceneVisualIntentTransport";

afterEach(() => vi.unstubAllGlobals());

it("round-trips a standalone scene generation through the dedicated ASAP stream", async () => {
  vi.stubGlobal("window", { location: { hostname: "127.0.0.1" } });
  const origin = "http://127.0.0.1:8082";
  const fetchStream = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(origin + "/api/message");
    const body = JSON.parse(String(init.body));
    const { action, params } = JSON.parse(body.html_content_ctx_dict.payload);
    expect(action).toBe("lingguang.ai.seedWorldStream");
    expect(body.html_content_ctx_dict.action).toBe(action);
    expect(params).toMatchObject({ sessionId: body.session_id, toolChoice: "required", parallelToolCalls: false });
    expect(params).not.toHaveProperty("responseFormat");
    const result = { content: "", finishReason: "tool_calls", toolCalls: [
      { id: "scene-1", type: "function", function: { name: "scene_generate", arguments: "{}" } }
    ] };
    const terminal = JSON.stringify({ version: 1, type: "lingguang_seed_world_stream_result", nonce: params.streamResponseNonce, result });
    const events = [terminal.slice(0, 13), terminal.slice(13)].map(data => ({ type: "content", data }));
    return new Response(events.map(event => "data: " + JSON.stringify(event) + "\n\n").join(""));
  });
  vi.stubGlobal("fetch", fetchStream);
  const result = await requestSceneGenerationChat({
    localAsapOrigin: origin, messages: [{ role: "user", content: "Generate a scene" }],
    tools: [{ type: "function", function: { name: "scene_generate", description: "Generate a scene",
      strict: true, parameters: { type: "object", properties: {}, additionalProperties: false, required: [] } } }],
    toolChoice: "required", debugMode: true, signal: new AbortController().signal
  });
  expect(result.toolCalls[0].id).toBe("scene-1");
  expect(fetchStream).toHaveBeenCalledTimes(1);
});
