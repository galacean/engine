import type { TrajectoryCell, TrajectoryDocument, TrajectoryPromptSnapshot, TrajectorySourceBlock, TrajectoryTokenUsage } from "@galacean/engine-ai-chat/ai-chat/trajectory/trajectory-model";
import type { TrajectoryCellProps, TrajectoryRequestNumber, TrajectoryTurnModel, TrajectoryUsage, TrajectorySourceBlock as DshBlock, ConversationPromptSnapshot, ImageAttachmentRef } from "./dsh/contracts.ts";
import type { MessageImageLoader } from "./platform-types.ts";
import { zh } from "./dsh/locales.ts";

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const usage = (value: TrajectoryTokenUsage | undefined): TrajectoryUsage | undefined => value && ({
  input: value.input, output: value.output, cacheRead: value.cacheRead, cacheWrite: value.cacheWrite, reasoning: value.thinking
});
function prompt(value: TrajectoryPromptSnapshot | undefined): ConversationPromptSnapshot | undefined {
  // A missing catalog must not masquerade as a complete schema snapshot.
  if (!value || value.tools.some(tool => !object(tool.parameters))) return undefined;
  const config = object(value.config) ? value.config : {};
  return { system: value.system, config: { ...config, provider: typeof config.provider === "string" ? config.provider : "", model: typeof config.model === "string" ? config.model : "" },
    tools: value.tools.flatMap(tool => object(tool.parameters) ? [{ ...tool, parameters: tool.parameters }] : []) };
}

/** Adapt recorded facts, never infer missing timing/usage or retrieve remote attachments. */
export function adaptTrace(document: TrajectoryDocument): {
  turns: readonly TrajectoryTurnModel[];
  requests: readonly TrajectoryRequestNumber[];
  loadImage: MessageImageLoader;
} {
  const images = new Map<string, string>();
  const imageIds = new Map<string, string>();
  const calls = new Map<string, TrajectorySourceBlock>();
  const anchors = new Map<string, TrajectoryCell>();
  const results = new Map<string, TrajectoryCell>();
  for (const cell of document.cells) {
    const key = `${cell.turn}\u0000${cell.step}`;
    if (!anchors.has(key)) anchors.set(key, cell);
    if (cell.kind === "assistant" && !cell.requestOnly) results.set(key, cell);
    if (cell.kind !== "assistant") continue;
    for (const block of cell.sourceBlocks ?? []) {
      if (block.type === "tool-call" && block.callId) calls.set(JSON.stringify([cell.turn, cell.step, block.callId]), block);
    }
  }
  let nextAttachment = 0;
  const blocks = (source: readonly TrajectorySourceBlock[] | undefined): DshBlock[] | undefined => source?.map(block => {
    const { attachment, file, ...rest } = block;
    const result: DshBlock = { ...rest };
    if (attachment) {
      // Only inline raster bytes are authorized. A trace is not permission to make network requests.
      const url = attachment.dataUrl;
      const mediaType = /^data:(image\/(?:png|jpeg|gif|webp));base64,/i.exec(url ?? "")?.[1]?.toLowerCase();
      const encoded = url?.slice(url.indexOf(",") + 1).replace(/\s/g, "");
      const bytes = attachment.bytes ?? (encoded ? Math.floor(encoded.length * 3 / 4) - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0) : undefined);
      if (url && mediaType && attachment.width && attachment.height && bytes !== undefined) {
        const attachmentId = imageIds.get(url) ?? `trace-image-${++nextAttachment}`;
        imageIds.set(url, attachmentId);
        const ref: ImageAttachmentRef = { attachmentId, mediaType: mediaType as ImageAttachmentRef["mediaType"],
          bytes, width: attachment.width, height: attachment.height, name: attachment.name };
        images.set(attachmentId, url);
        result.attachment = ref;
      }
      // Keep incomplete metadata visible instead of manufacturing image dimensions or byte counts.
      if (!result.attachment) result.content = block.content || JSON.stringify(attachment, null, 2);
    }
    if (file && file.bytes !== undefined && file.name) result.file = { attachmentId: `trace-file-${++nextAttachment}`, name: file.name, bytes: file.bytes };
    return result;
  });
  const cell = (value: TrajectoryCell): TrajectoryCellProps => {
    const isProgram = value.toolName === "execute";
    // execute is Seed World's PTC entry point. Normalize the semantic name, retain the recorded display label.
    const originalCall = value.kind === "tool" && value.callId
      ? calls.get(JSON.stringify([value.turn, value.step, value.callId])) : undefined;
    const programArgs = originalCall?.content || (isProgram && value.inputDetail !== undefined ? JSON.stringify({ code: value.inputDetail }) : value.inputDetail);
    const imageCount = value.sourceBlocks?.filter(block => block.type === "image").length ?? 0;
    const fileCount = value.sourceBlocks?.filter(block => block.type === "file").length ?? 0;
    const attachmentSummary = [
      imageCount > 0 ? zh["layout.imageCount"].replace("{count}", String(imageCount)) : "",
      fileCount > 0 ? zh["layout.fileAttachments"].replace("{count}", String(fileCount)) : ""
    ].filter(Boolean).join(" · ");
    // DSH distinguishes pending (undefined) from settled with no content (empty string).
    const outputDetail = (value.kind === "tool" || value.kind === "subtool") && value.status === "completed"
      ? value.outputDetail ?? "" : value.outputDetail;
    return {
      index: value.index, recordId: value.id, sourceSeq: value.index,
      kind: value.kind === "assistant" ? "message" : value.kind,
      text: value.kind === "user" ? attachmentSummary
        : value.kind === "assistant" && (value.outputDetail || value.thinkingDetail) ? "" : value.text,
      previewMarkdown: value.kind === "assistant" ? value.outputDetail ?? value.thinkingDetail : value.preview,
      opensTurn: value.kind === "user", requestOnly: value.requestOnly,
      inputDetail: programArgs, outputDetail, thinkingDetail: value.thinkingDetail,
      result: value.result, callId: value.callId, toolName: isProgram ? "run_code" : value.toolName,
      isError: value.isError, timeSeconds: value.durationMilliseconds === null ? null : value.durationMilliseconds / 1000,
      startedAt: value.startedAtMilliseconds,
      sourceBlocks: blocks(value.sourceBlocks), outputBlocks: blocks(value.outputBlocks),
      promptDetail: prompt(value.promptDetail), previousPromptDetail: prompt(value.previousPromptDetail),
      systemPromptDetail: value.systemPromptDetail ?? value.promptDetail?.system,
      schemaDetail: value.schemaDetail, messageSource: value.messageSource, assistantMetrics: value.assistantMetrics,
      input: value.usage?.input, output: value.usage?.output, think: value.usage?.thinking,
      cacheRead: value.usage?.cacheRead, cacheWrite: value.usage?.cacheWrite,
    };
  };
  const turns = document.turns.map(turn => {
    const groups: { title: string; description?: string; cells: TrajectoryCellProps[] }[] = [];
    const descriptions = new Map(turn.groups.map(group => [group.title, group.description]));
    // A later SYSTEM update must not be pulled back into the initial Message group.
    for (const value of turn.cells) {
      let group = groups.at(-1);
      if (group?.title !== value.group) {
        group = { title: value.group, description: descriptions.get(value.group), cells: [] };
        groups.push(group);
      }
      group.cells.push(cell(value));
    }
    return { turn: turn.turn, groups };
  });
  const requests: TrajectoryRequestNumber[] = document.requests.map(request => {
    const key = `${request.turn}\u0000${request.step}`;
    const result = results.get(key);
    const anchor = anchors.get(key);
    const options = object(request.requestOptions) ? request.requestOptions : {};
    const provider = request.provider ?? (typeof options.provider === "string" ? options.provider : undefined);
    const model = request.model ?? (typeof options.model === "string" ? options.model : undefined);
    return {
      group: request.group, number: request.number, turn: request.turn, step: request.step,
      seq: anchor?.index, resultSeq: result?.index,
      status: request.status === "completed" ? "complete" : request.status === "failed" ? "error" : "running",
      startedAt: request.startedAtMilliseconds ?? undefined, completedAt: request.finishedAtMilliseconds,
      retry: request.retry, error: request.error, errorCode: request.errorCode,
      provider, model,
      requestConfig: request.requestOptions === undefined ? undefined
        : { ...options, provider: provider ?? "", model: model ?? "" },
      usage: usage(request.usage), cumulativeUsage: usage(request.cumulativeUsage)
    };
  });
  const loadImage: MessageImageLoader = async attachment => {
    const url = images.get(attachment.attachmentId);
    if (!url) throw new Error("Trace does not contain this image");
    return url;
  };
  loadImage.peek = attachment => images.get(attachment.attachmentId);
  return { turns, requests, loadImage };
}
