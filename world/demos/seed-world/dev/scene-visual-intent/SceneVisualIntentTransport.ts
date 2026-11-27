import type { AgentMessage, AgentModelToolDefinition, AgentRunOptions } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import {
  ASAP_MODEL_ROUND_TIMEOUT_MS,
  requestAsapChat,
  type AsapChatResult,
  type SeedWorldAiApi
} from "@galacean/engine-ai-chat/ai-chat/asap-chat";

/** Debug options belong to this demo, never to the shared Seed World Agent. */
export type SceneGenerationRunOptions = AgentRunOptions & {
  localAsapOrigin?: string;
  modelTimeoutMs?: number;
};
type SceneGenerationChatOptions = SceneGenerationRunOptions & {
  messages: AgentMessage[];
  tools: AgentModelToolDefinition[];
  toolChoice?: "auto" | "required";
  debugMode: boolean;
  signal: AbortSignal;
};

export async function requestSceneGenerationChat(options: SceneGenerationChatOptions): Promise<AsapChatResult> {
  const { localAsapOrigin, modelTimeoutMs, contextCompaction: _contextCompaction, ...params } = options;
  if (localAsapOrigin === undefined) return requestAsapChat(params);
  const origin = validateLocalAsapOrigin(localAsapOrigin);
  const timeoutMs = modelTimeoutMs ?? 25_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > ASAP_MODEL_ROUND_TIMEOUT_MS) {
    throw new Error(`modelTimeoutMs 必须是不超过 ${ASAP_MODEL_ROUND_TIMEOUT_MS} 的正整数`);
  }
  return requestAsapChat({ ...params, timeoutMs }, createLocalApi(origin));
}

function validateLocalAsapOrigin(value: string): string {
  if (!isLocalPreview()) throw new Error("localAsapOrigin 仅允许在本地预览页面使用");
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("localAsapOrigin 须为完整的本地服务 origin"); }
  if (!isLoopbackHostname(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("localAsapOrigin 仅接受无凭据、路径和查询参数的 loopback HTTP(S) origin");
  }
  return url.origin;
}

function isLocalPreview(): boolean {
  return isLoopbackHostname(window.location.hostname);
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

// The standalone gallery has no shell. It uses the same ASAP demo endpoints as LocalCandyJar.
function createLocalApi(origin: string): SeedWorldAiApi {
  async function post(path: string, body: unknown, signal: AbortSignal) {
    const response = await fetch(origin + path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "omit", redirect: "error", body: JSON.stringify(body), signal
    });
    if (!response.ok) {
      const message = response.status === 429 ? "本地 ASAP 服务限流" : "本地 ASAP 请求失败";
      throw new Error(`${message}（HTTP ${response.status}）`);
    }
    return response;
  }

  return {
    async seedWorldStream({ signal, onEvent: _onEvent, ...params }) {
      if (params.tools?.length) params.parallelToolCalls = false;
      const action = "lingguang.ai.seedWorldStream";
      const artifact = { artifactId: "ai-chat-local", artifactVersion: window.artifactVersion || "1" };
      const response = await post("/api/message", {
        message: action, format: "html", agent: "follow_up_no_search", components_options: "leopard",
        session_id: params.sessionId, ext_info: { alipay_uid: "seed-world-local-debug" },
        html_content_ctx_dict: { action, ...artifact, payload: JSON.stringify({ action, params, ...artifact }) }
      }, signal);
      // This gallery consumes a single completed generation. ASAP sends one JSON object per SSE data line.
      let content = "";
      for (const line of (await response.text()).split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const event = JSON.parse(line.slice(5));
        if (event.type === "error") {
          if (event.data && typeof event.data === "object") throw event.data;
          throw new Error(event.data || "本地 ASAP 流式请求失败");
        }
        if (event.type === "content" && typeof event.data === "string") content += event.data;
      }
      return { content };
    },
    async seedWorldStop(sessionId) {
      const action = "lingguang.ai.stopChat";
      const response = await post("/api/remote_skill", {
        alipay_uid: "seed-world-local-debug", session_id: sessionId,
        params: { action, source: "model", payload: JSON.stringify({ action, params: { sessionId } }) }
      }, AbortSignal.timeout(10_000));
      const reply = await response.json();
      return reply.success ? JSON.parse(reply.data) : reply;
    }
  };
}
