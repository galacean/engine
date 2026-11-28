export const code = "const result = await world.query({ limit: 1 });\nconsole.log(result);\n";
export const rawArguments = '{  "code": ' + JSON.stringify(code) + ', "description": "Inspect world"  }';
export const markdown = '# Inspection complete\n\n**World inspected** safely.\n\n| Property | Value |\n| --- | --- |\n| Entities | 1 |\n\n- [x] Query scene\n\nFormula: $x^2$\n\n```typescript\nconst result = 1;\n```\n\n[Unsafe](javascript:alert(1)) <script>bad()</script>';
export const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afo4AAAAASUVORK5CYII=";
export function exampleTrace() {
  const start = Date.parse("2026-10-22T04:00:00.000Z");
  const event = (elapsedMilliseconds: number, event: unknown) => ({ elapsedMilliseconds, event });
  const tools = [{ name: "execute", description: "Run a program", parameters: { type: "object", properties: { code: { type: "string", description: "TypeScript program" } }, required: ["code"] } }];
  const messages = [{ role: "system", content: "Inspect the world. Do not change it." }, { role: "user", content: [
    { type: "text", text: "Inspect world" },
    { type: "image", image: { dataUrl: tinyPng, width: 1, height: 1 } },
    { type: "file", file: { name: "notes.txt", bytes: 12 } }
  ] }];
  return {
    schemaVersion: 1, interactionId: "offline-example", startedAt: new Date(start).toISOString(), finishedAt: new Date(start + 3000).toISOString(),
    durationMilliseconds: 3000, status: "completed", input: { source: "text", text: "Inspect world", content: messages[1].content },
    agentEvents: [
      event(0, { type: "model_started", step: 1 }),
      event(1, { type: "model_request", step: 1, messages, tools, options: { temperature: 0.2, maxTokens: 2048 } }),
      event(1000, { type: "model_finished", step: { step: 1, toolCallId: "execute-1", decision: { type: "execute", code }, attempts: [
        { attempt: 1, firstTokenAtMilliseconds: start + 100, error: "retryable upstream error" },
        { attempt: 2, firstTokenAtMilliseconds: start + 500, rawContent: "",
          toolCalls: [{ id: "execute-1", function: { name: "execute", arguments: rawArguments } }],
          debug: { reasoningContent: "First inspect without changing the scene.", provider: "example", modelName: "example-model", usage: { inputTokens: 100, outputTokens: 60, reasoningTokens: 20 } }, error: null }
      ] } }),
      event(1001, { type: "script_started", step: 1, code }),
      event(1100, { type: "tool_started", step: 1, tool: "world.query", input: { limit: 1 } }),
      event(1200, { type: "tool_finished", step: 1, tool: "world.query", result: { ok: true, value: { entities: [{ id: "tree-1" }] } } }),
      event(1300, { type: "script_finished", step: 1, result: { ok: true, value: { entities: [{ id: "tree-1" }] } } }),
      event(1400, { type: "model_started", step: 2 }),
      event(1401, { type: "model_request", step: 2, messages, tools }),
      event(2900, { type: "model_finished", step: { step: 2, decision: { type: "final", message: markdown }, attempts: [
        { attempt: 1, rawContent: markdown,  firstTokenAtMilliseconds: start + 1500,
          debug: { reasoningContent: "The result confirms one entity.", provider: "example", modelName: "example-model", usage: { inputTokens: 180, outputTokens: 100 } }, error: null }
      ] } })
    ]
  };
}

export function screenshotTrace() {
  const image = { attachmentId: "image-1", width: 1, height: 1 };
  const messages = [
    { role: "system", content: "Inspect the view without changing it." },
    { role: "user", content: "Inspect view" }
  ];
  const toolCall = { id: "view-1", type: "function", function: { name: "snapshot", arguments: "{}" } };
  const content = JSON.stringify({ contextKind: "view_observation", metadata: { capturedAt: "2026-10-22T04:00:01.100Z" } });
  return {
    ...exampleTrace(), input: { source: "text", text: "Inspect view" },
    attachments: [{ ...image, dataUrl: tinyPng }],
    agentEvents: [
      { elapsedMilliseconds: 0, event: { type: "model_started", step: 1 } },
      { elapsedMilliseconds: 1, event: { type: "model_request", step: 1, messages } },
      { elapsedMilliseconds: 1000, event: { type: "model_finished", step: { step: 1, toolCallId: "view-1",
        decision: { type: "snapshot" }, attempts: [{ attempt: 1, rawContent: "", toolCalls: [toolCall] }] } } },
      { elapsedMilliseconds: 1100, event: { type: "view_observed", step: 1, toolCallId: "view-1", image,
        metadata: { capturedAt: "2026-10-22T04:00:01.100Z" } } },
      { elapsedMilliseconds: 1200, event: { type: "model_started", step: 2 } },
      { elapsedMilliseconds: 1201, event: { type: "model_request", step: 2, messages: [
        ...messages, { role: "assistant", content: "", toolCalls: [toolCall] },
        { role: "tool", toolCallId: "view-1", content: '{"ok":true}' }, { role: "user", content, image }
      ] } },
      { elapsedMilliseconds: 2000, event: { type: "model_finished", step: { step: 2,
        decision: { type: "final", message: "Observed the screenshot." },
        attempts: [{ attempt: 1, rawContent: "Observed the screenshot." }] } } }
    ]
  };
}
