import { isNativeFileTool, nativeFileDefinitions } from "./agent-native-files";
import type {
  AgentImageReadDecision,
  AgentPointerDecision,
  AgentApplicationDefinition,
  AgentMessage,
  AgentScriptDecision,
  AgentToolCall,
  AgentModelToolDefinition,
  AgentValue,
  AgentUserInput
} from "./agent-types";
import type { ConversationHistorySnapshot } from "./conversation-history";
import type { AgentImageReference } from "./agent-image-store";

const MAX_SCRIPT_CHARS = 32 * 1024;
// Conciseness is presentation guidance; the protocol bound protects retained context.
const MAX_FINAL_MESSAGE_CHARS = 8_192;

export const AGENT_PROTOCOL = [
  "【职责】",
  "理解本轮用户指令，完整保留其中的对象范围、数量、空间关系和修改意图。",
  "自主选择完成任务所需的能力与步骤。",
  "",
  "【工作原则】",
  "行动前考虑完整目标、已有证据和必要依赖，识别尚缺的能力说明或状态信息；不要只处理指令中的局部动作。",
  "只补充完成当前目标所缺的信息；信息充分后就执行或回复，不为确认而反复确认，不为丰富回复扩展调查范围。",
  "操作是否完成以实际 Tool Result 为依据；根据每次执行结果判断目标是否完成、还缺什么，再决定继续行动或结束。未执行、预览、失败或部分完成时应如实说明，不能当作全部完成。",
  "复用已有查询结果；只在证据不足、相互矛盾或相关状态可能变化时复查。避免没有进展的反复读写；发现重复时调整方法，仍无法推进则说明障碍。",
  "",
  "【输入上下文】",
  "agent_task.instruction 是本任务的初始指令；agent_task.inputs 是按接收顺序排列、已投递的用户补充。共同构成当前目标，较新输入只覆盖与其冲突的旧要求，其他目标继续保留。",
  "user_input 消息标记补充进入执行过程的位置，每条输入的 context 属于该次输入；不要将新输入的对象指代套到旧输入。回答追加问题后，原任务仍未完成时继续执行。",
  "agent_task.history 包含最近五个已结束任务，按完成时间从近到远排列；每项为 { timestamp: 完成时间, instruction: 初始指令, inputs: 可选补充, result: 执行结果 }。它用于补全本轮未明确表达的上下文和指代，但不得覆盖本轮指令；优先参考较近记录，仍无法唯一确定时再查询。",
  "稳定 Ref/ID 是资产身份的最高优先级证据。上下文已提供与本轮对象唯一对应的完整 Ref 时直接复用；仅有 ID 时按 ID 精确查询恢复 Ref。只有不存在唯一 Ref/ID，或用户明确要求改选对象时，才使用其他条件查询和消歧。",
  "agent_task 或补充输入的 inputSource 为 voice 时，对应文本可能包含同音字、近音字、断句或量词错误。应结合上下文、world_thumbnail 和可用 API，直接采用最可能的意图。",
  "语音纠错遵循最小改写原则：优先选择与原转写在发音、词序和长度上最接近、且能由可用 API 表达的完整指令；不得为了匹配某项能力而补充原文没有的对象、属性或修改意图。",
  "world_thumbnail 是当前应用提供的有界状态摘要，可能为空或不完整。当前状态和执行结果以相关的最新 world_thumbnail 与 Tool Result 为证据，不把历史成功当作当前状态；摘要中未出现不等于不存在，影响决策的缺失信息应获取，不得猜测。",
  "",
  "【执行协议】",
  "这是由系统逐轮驱动的应答式 Agent。每次模型调用可提交一个或多个 Tool Call，或在任务已完成时直接回复用户。",
  "每个 Tool Call 必须有独立 ID，系统逐一返回对应结果。独立读取可并行，修改和脚本调用按提交顺序独占执行；后续依赖尚未返回的信息时，先等待本批结果。",
  "",
  "【过程说明】",
  "首次行动、切换处理阶段或遇到需要调整的问题时，在同一次工具调用响应的正文中给出一到两句面向用户的简短说明，描述当前目标、已确认的进展或接下来要做的事。没有新信息时可以省略，不要重复播报。",
  "仍需行动时，过程说明必须与本次工具调用一起返回，不能只返回说明而结束任务。说明不包含内部推理、脚本或工具参数；尚未执行的行动用计划语气，已经完成的描述必须有执行结果依据。",
  "",
  "【回复标准】",
  "已有上下文足以回答且无需执行操作时，直接回复；仍需获取声明、查询状态、执行操作或核对结果时必须调用 Tool。",
  "最终回复完整说明对用户有用的实际结果、未完成部分和重要限制；简单任务简短回应，多项结果按需分段或分点说明。不要为了简短省略用户要求的细节，也不要重复整个执行过程，不暴露内部步骤、脚本、思维链或其他实现细节。",
  "面向用户自然、亲切地回应，先说操作结果，再用日常语言描述与用户意图相关的变化；篇幅与任务复杂度和用户要求相匹配。语气温暖但不过度热情，不机械套用完成通报、固定开场或语气词，不添加无依据的效果评价。",
  "默认不罗列内部参数、技术术语、配置关系、倍率或统计数字；用户明确要求的数值、查询结果以及理解结果所必需的信息应保留，并用用户能理解的语言表达。实际影响范围超出用户指定对象时，必须用日常语言如实说明，不得为了简短而隐瞒。",
  "历史回复只作为事实和指代的上下文，不沿用其中不符合当前回复标准的措辞。"
].join("\n");

export function buildAgentSystemPrompt(definition: AgentApplicationDefinition): string {
  if (!definition.scriptApi.catalog.trim())
    throw new Error("AgentApplicationDefinition.scriptApi.catalog cannot be empty");
  return AGENT_PROTOCOL;
}

export function buildAgentToolDefinitions(
  definition: AgentApplicationDefinition,
  hasSavedImages = false
): AgentModelToolDefinition[] {
  const tools: AgentModelToolDefinition[] = [];
  if (definition.observeView)
    tools.push({
      type: "function",
      function: {
        name: "observe_view",
        description:
          "查看用户当前相机视角的实际画面，返回图片及拍摄时的相机和世界状态信息。它是视觉观察，不是对象清单；遮挡或画面外的对象不可据此判断。你自主决定是否需要查看。相机或世界状态变化会使缓存失效；图片是拍摄时的观察，不代表之后的状态。",
        parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
        strict: true
      }
    });
  if (definition.observeView || hasSavedImages)
    tools.push({
      type: "function",
      function: {
        name: "read_image",
        description:
          "按 imageId 读取已保存的图片版本，不拍摄新画面。agent_task.history 中每条消息的 visualReferences 按该次发送顺序标识图片；同一截图的不同标记版本有不同 imageId。agent_task.images 列出图片引用及 available 状态，只有 available=true 才能重读。历史图片保留时间由应用管理，过期返回 IMAGE_EXPIRED；普通观察图片仅在当前任务有效。旧图片只表示拍摄时的画面。",
        parameters: {
          type: "object",
          properties: { imageId: { type: "string", minLength: 1, maxLength: 128 } },
          required: ["imageId"],
          additionalProperties: false
        },
        strict: true
      }
    });
  if (definition.observeView && definition.supportsViewPointer)
    tools.push({
      type: "function",
      function: {
        name: "pointer",
        description:
          "按 imageId 和图片左上角起算的整数像素 x/y，读取 observe_view 保存画面中的注册对象。只读，不点击或改变选择。identified 返回对象身份 ref、类型 type 和表面命中位置 hitPosition。unidentified 不代表没有物体，unmapped 表示没有对应的作者身份。快照被释放或世界改变时重新 observe_view。",
        parameters: {
          type: "object",
          properties: {
            imageId: { type: "string", minLength: 1, maxLength: 128 },
            x: { type: "integer", minimum: 0 },
            y: { type: "integer", minimum: 0 }
          },
          required: ["imageId", "x", "y"],
          additionalProperties: false
        },
        strict: true
      }
    });
  tools.push({
    type: "function",
    function: {
      name: "execute",
      description: [
        "执行一段使用已注册 API 的 Agent Script，以查询、计算或修改应用状态。",
        "code 是异步 JavaScript 脚本正文，直接使用 await、console.log 和 return，无需入口函数。函数声明遵循普通 JavaScript 语义，不会自动调用。",
        "code 使用 JavaScript 语法，不进行 TypeScript 转译；读取的 `.d.ts` 仅用于理解接口。不要使用类型注解或 `as` 类型断言；需要区分返回类型时，使用条件判断。",
        "脚本通过声明中提供的 tools.* 或 editor.* 调用已注册 API，异步查询和代理方法必须 await；Editor 代理只有身份，状态通过声明的方法显式读取，不是 Engine 实例。",
        "执行前会用完整声明环境检查 JS；工程编辑 API 读写同一草稿，整段成功后才提交；独立命令遵循各自声明的提交边界。API 调用只解析为声明中的成功值；编辑 API 失败即使被 catch，事务也会失败。不要读取声明中不存在的 ok 或 error 字段。",
        "使用外层 read/glob/grep 工具读取项目文档和 API 声明；已知相关路径时直接读取，未知时从 editor/README.md 开始。execute 只提供编辑器与世界 API，不提供文件工具。",
        "console.log/info/warn/error 和 return 都可以输出结果。Console 适合输出多项结果或中间信息；return 返回一个最终 JSON 值并结束脚本，不要求显式返回。只输出下一步决策需要的数据，同一份完整结果选择 Console 或 Return 输出一次，无需同时打印并返回。Console 与 Return 分开如实呈现，异常前日志保留。超长输出提供 outputFile，可用外层 read 工具续读；输出截断不表示执行失败。",
        "失败的 Tool Result 与本次 execute.code 配对且不重复脚本正文；结合原脚本、error 和可选 location 修正。location.source=execute.code，line/column 是原始脚本行列，target=return 表示脚本返回值。receipt 是宿主给出的最终事实：rejected 表示未执行；aborted 表示草稿已丢弃，其中新建引用不可复用；committed 表示已提交，runtimeErrors 仅表示后续运行失败，不得重复创建；publication_failed 表示发布状态不确定，先检查现状。独立命令使用 completed/interrupted，后续脚本失败不会回滚先前提交。commands 仅保留有界提交事实；unknown 表示可能已提交，同一脚本停止后续写入但允许查询验证，Agent Loop 停止自动执行。确定未执行的拒绝可捕获后查询并重试。执行证据中的工具成功不代表草稿已提交。"
      ].join(""),
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", minLength: 1, maxLength: MAX_SCRIPT_CHARS }
        },
        required: ["code"],
        additionalProperties: false
      },
      strict: true
    }
  });
  tools.push(...nativeFileDefinitions());
  return tools;
}

export function buildAgentMessages(input: {
  systemPrompt: string;
  taskId: string;
  userInput: string;
  inputSource: "text" | "voice";
  worldThumbnail: AgentValue;
  taskContext?: AgentValue;
  inputs?: readonly AgentUserInput[];
  conversationHistory?: ConversationHistorySnapshot;
  transcript?: readonly AgentMessage[];
  images?: readonly AgentImageReference[];
}): AgentMessage[] {
  return [
    { role: "system", content: input.systemPrompt },
    {
      role: "user",
      content: JSON.stringify({
        contextKind: "agent_task",
        taskId: input.taskId,
        inputSource: input.inputSource,
        instruction: input.userInput,
        ...(input.inputs?.length ? { inputs: input.inputs } : {}),
        context: input.taskContext,
        world_thumbnail: input.worldThumbnail,
        history: input.conversationHistory ?? [],
        ...(input.images?.length ? { images: input.images } : {})
      })
    },
    ...structuredClone(input.transcript ?? [])
  ];
}

export function parseAgentToolCall(
  toolCall: AgentToolCall
):
  | AgentScriptDecision
  | AgentImageReadDecision
  | AgentPointerDecision
  | { type: "observe_view" }
  | import("./agent-types").AgentFileDecision {
  let rawArguments: unknown;
  try {
    rawArguments = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    throw new Error(`Tool '${toolCall.function.name}' arguments 不是合法 JSON：${getErrorMessage(error)}`);
  }
  if (!isRecord(rawArguments)) {
    throw new Error(`Tool '${toolCall.function.name}' arguments 必须是对象`);
  }

  if (isNativeFileTool(toolCall.function.name))
    return { type: "file", name: toolCall.function.name, input: rawArguments };

  if (toolCall.function.name === "observe_view") {
    if (Object.keys(rawArguments).length) throw new Error("observe_view 不接受参数");
    return { type: "observe_view" };
  }

  if (toolCall.function.name === "read_image") {
    if (
      Object.keys(rawArguments).some((key) => key !== "imageId") ||
      typeof rawArguments.imageId !== "string" ||
      !rawArguments.imageId.trim() ||
      rawArguments.imageId.length > 128
    )
      throw new Error("read_image.imageId 无效");
    return { type: "read_image", imageId: rawArguments.imageId };
  }
  if (toolCall.function.name === "pointer") {
    if (
      Object.keys(rawArguments).some((key) => !["imageId", "x", "y"].includes(key)) ||
      typeof rawArguments.imageId !== "string" ||
      !rawArguments.imageId.trim() ||
      rawArguments.imageId.length > 128 ||
      !Number.isSafeInteger(rawArguments.x) ||
      (rawArguments.x as number) < 0 ||
      !Number.isSafeInteger(rawArguments.y) ||
      (rawArguments.y as number) < 0
    )
      throw new Error("pointer 参数无效");
    return { type: "pointer", imageId: rawArguments.imageId, x: rawArguments.x as number, y: rawArguments.y as number };
  }

  if (toolCall.function.name !== "execute") {
    throw new Error(`模型调用了未注册的 Agent Tool：${toolCall.function.name}`);
  }
  if (typeof rawArguments.code !== "string") {
    throw new Error("execute.code 必须是字符串");
  }
  const code = rawArguments.code;
  if (!code.trim()) throw new Error("execute 缺少 Agent Script code");
  if (code.length > MAX_SCRIPT_CHARS) {
    throw new Error(`Agent Script code 超过 ${MAX_SCRIPT_CHARS} 字符`);
  }
  return { type: "execute", code };
}

export function parseAgentFinalMessage(content: string): string {
  const message = content.trim();
  if (!message) throw new Error("模型没有返回 Tool Call 或最终回复");
  if (message.length > MAX_FINAL_MESSAGE_CHARS) {
    throw new Error(`最终回复超过 ${MAX_FINAL_MESSAGE_CHARS} 个字符`);
  }
  return message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getErrorMessage(value: unknown): string {
  return value instanceof Error && value.message ? value.message : "JSON 解析失败";
}
