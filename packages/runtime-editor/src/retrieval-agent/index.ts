import searchCloudSkill from "./search-cloud.md?raw";
import { z } from "zod";
import type { AgentEditorExtension } from "@galacean/engine-ai-chat/ai-chat/agent-extensions";
import type { AgentNativeReadTool } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { RetrievalClient } from "@galacean/engine-retrieval/retrieval/index";
import { createRetrievalAssetSource } from "./asset-source";
import { descriptionsInputSchema, searchAssetsToolContract } from "@galacean/engine-retrieval/retrieval/src/contracts";

/** The host owns the library lifetime. Discovery never opens an editor transaction or imports assets. */
export function createRetrievalAgentExtension(
  library: Pick<RetrievalClient, "searchAssets" | "readAssetDescriptions" | "readText">
): AgentEditorExtension {
  const search = searchAssetsToolContract;
  const textInput = z
    .object({
      action: z.literal("read"),
      path: z.string().min(1),
      offset: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(1000).optional()
    })
    .strict();
  const nativeReadTools: AgentNativeReadTool[] = [
    {
      definition: {
        type: "function",
        function: {
          name: search.name,
          description: search.description,
          parameters: z.toJSONSchema(search.inputSchema),
          strict: true
        }
      },
      invoke: (input, { signal }) => library.searchAssets(search.inputSchema.parse(input), { signal })
    },
    {
      definition: {
        type: "function",
        function: {
          name: "read_asset_descriptions",
          description:
            "读取 search_assets 返回候选的完整资产描述，包括外观、尺寸及使用信息。descriptionPaths 使用搜索返回的 descriptionPath，按需选择少量候选，不遍历全部资产。这里只读资产库，不导入或修改当前项目。",
          parameters: z.toJSONSchema(descriptionsInputSchema),
          strict: true
        }
      },
      invoke: (input, { signal }) => library.readAssetDescriptions(descriptionsInputSchema.parse(input), { signal })
    },
    {
      definition: {
        type: "function",
        function: {
          name: "source_text",
          description:
            "按 /oss/assets/... 来源路径读取 README、manifest 等文本；使用 action=read，offset 从第 1 行起，limit 为行数。当前仅支持 read。项目文件和 skills/ 使用 read 工具；二进制物料使用 editor.asset.import 导入。",
          parameters: z.toJSONSchema(textInput),
          strict: true
        }
      },
      invoke: async (raw, { signal }) => {
        const input = textInput.parse(raw);
        const text = await library.readText(input.path, { signal, maxBytes: 4 * 1024 * 1024 });
        const lines = text ? text.replace(/\r?\n$/, "").split(/\r?\n/) : [];
        const start = (input.offset ?? 1) - 1;
        if (start > lines.length) throw new Error("Offset exceeds source line count");
        const end = Math.min(lines.length, start + (input.limit ?? 200));
        return {
          success: true,
          action: "read",
          path: input.path,
          content: lines
            .slice(start, end)
            .map((line, i) => `${String(start + i + 1).padStart(6, " ")}\t${line}`)
            .join("\n"),
          totalLines: lines.length,
          truncated: end < lines.length,
          ...(end < lines.length ? { nextOffset: end + 1 } : {})
        };
      }
    }
  ];
  return {
    tools: [],
    definition: {
      toolNames: [],
      nativeReadTools,
      scriptApi: {
        hostNotes: "项目里没有合适资源时，读[检索云端素材](skills/assets/search-cloud/SKILL.md)。",
        documents: [{ path: "skills/assets/search-cloud/SKILL.md", content: searchCloudSkill }],
        entries: [],
        modules: []
      }
    }
  };
}

/** The host owns one lazy Worker shared by discovery, documentation and asset import. */
export function createRetrievalIntegration(manifestUrl: string) {
  const library = new RetrievalClient(manifestUrl);
  return {
    source: createRetrievalAssetSource(library),
    extension: createRetrievalAgentExtension(library),
    dispose: () => library.dispose()
  };
}
