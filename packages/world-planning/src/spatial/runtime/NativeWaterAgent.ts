import type { AgentEditorExtension } from "@galacean/engine-ai-chat/ai-chat/agent-extensions";
import type { AgentTool, AgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import type { RuntimeEditorEdit } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import {
  editWaterColor,
  editWaterSource,
  editWaterTexture,
  type WaterSourceAuthoring,
  type WaterSourceOperation
} from "./NativeWaterEditor";
import type { SeedWorldWaterColorRgb } from "@galacean/engine-water/world/SeedWorldWaterColor";

type WaterAuthorCommand =
  | WaterSourceOperation
  | { operation: "list" }
  | { operation: "get"; id: string }
  | { operation: "color"; id: string; color: SeedWorldWaterColorRgb; scope: "shared" | "instance" }
  | { operation: "texture"; id: string; path: string; scope: "shared" | "instance" };

const declaration = `type WaterRef = { $ref: string };
type Point = { id: string; x: number; z: number; elevation?: number; width: number; depth: number };
type Section = { id: string; from: string; to: string; form: "auto"|"slope"|"waterfall"|"steps"; carve?: boolean; drop?: number; stepCount?: number };
type Shape = { kind:"lake"; shoreline:{id:string;ring:string;x:number;z:number}[]; referenceLevel:number; levelOffsetM:number; basin?:{depthM:number;bankWidthM:number;carve:boolean} }
 | { kind:"river"; course:{id:string;points:Point[];sections?:Section[];bankClearance?:number;dropThreshold?:number;slopeThreshold?:number;probeSpacing?:number};speed:number;bankWidthM?:number }
 | { kind:"ocean"; waterLevel:number; layout:{schemaVersion:1;kind:"ocean-surface-layout";centerXZ:[number,number];size:number;surfaceTopology:"finite"|"fixed-lod";finitePatchGridSize?:number;fixedLodCentralPatchGridSize?:number;nearshoreThinFilmTransitionWidth?:number;shoreViewEnvelope?:{centerXZ:[number,number];halfExtentXZ:[number,number];maximumVisibleDistance:number}} };
type Quality = { geometry?:"low"|"medium"|"high"; surfaceShading?:"low"|"medium"|"high";sceneFields?:"local-only"|"scene-color"|"scene-color-depth";opaqueDownsampling?:"none"|"2x"|"4x";query?:"off"|"sparse"|"dense";
 reflectionBudget?:{environment?:boolean;screenSpace?:boolean};surfaceEffectBudget?:{caustics?:boolean};
 spatialField?:{maximumHorizontalError?:number;maximumDepthError?:number;maximumGpuDepthDecodeError?:number;maximumGpuShoreDecodeError?:number;maximumAtlasPixels?:number};
 backendBudgets?:{ocean?:{finitePatchSegments?:number;fixedLodRingPatchSegments?:number;fixedLodCentralPatchSegments?:number;fixedLodFirstRingPatchSegments?:number;nearshoreFixedStepRateHz?:number;nearshoreMaximumSeekSeconds?:number;windResponseFixedStepRateHz?:number;windResponseMaximumCatchUpSteps?:number}} };
type Input = { shape:Shape; terrain?:WaterRef; terrainBinding?:"host";quality?:Quality;material:WaterRef;visible?:boolean;priority?:number;interaction?:{query:boolean;buoyancy:boolean;wake:boolean}; connections?:{id:string;target:{$component:string|{instance:string;target:string}};section:[[number,number],[number,number]];transitionLengths:[number,number]}[] };
type Command = {operation:"list"}|{operation:"get";id:string}|{operation:"create";name:string;input:Input;parent?:string}
 | {operation:"update";id:string;patch:Partial<Input>}|{operation:"updateMany";updates:{id:string;patch:Partial<Input>}[]}
 | {operation:"setEnabled";id:string;enabled:boolean}|{operation:"remove";id:string}
 | {operation:"color";id:string;color:[number,number,number];scope:"shared"|"instance"}
 | {operation:"texture";id:string;path:string;scope:"shared"|"instance"};
/** Metres, metres/second and RGB 0..255. Writes prepare the current public project draft. */
export declare function author(command:Command): Promise<unknown>;`;

/** The discovery package has no author permission. Each execution binds it to the host's existing edit. */
export function createNativeWaterAgentPackage(
  edit?: Pick<RuntimeEditorEdit, "run" | "withAsset">,
  scenePath?: string
): AgentEditorExtension {
  const tool: AgentTool = {
    name: "water.author",
    parseInput: (value) => {
      const command = value as WaterAuthorCommand;
      if (
        !command ||
        !["list", "get", "create", "update", "updateMany", "setEnabled", "remove", "color", "texture"].includes(
          command.operation
        )
      )
        throw new Error("INVALID_ARGUMENT: Unknown Water author operation.");
      return command;
    },
    parseOutput: (value) => value,
    execute: async (value, context) => {
      context.signal.throwIfAborted();
      if (!edit) throw new Error("NOT_SUPPORTED: Water authoring requires a public project edit.");
      const path = scenePath ?? (await edit.run(({ draft }) => draft.preview().project.scene));
      const command = value as WaterAuthorCommand;
      if (command.operation === "list" || command.operation === "get")
        return edit.run(({ draft }) => {
          const scene = new RuntimeSceneEdit(draft, path);
          const records = scene.queryComponents({
            type: "WaterBodyComponent",
            ...(command.operation === "get" ? { id: command.id } : {})
          });
          if (command.operation === "get" && !records.length)
            throw new Error(`NOT_FOUND: Source Water '${command.id}'.`);
          return records.map((identity) => {
            const props = scene.readComponent(identity.id).props ?? {},
              input = props.authoring as unknown as WaterSourceAuthoring;
            return {
              ...identity,
              enabled: props.enabled ?? true,
              ...(command.operation === "get"
                ? { authoring: input }
                : { kind: input?.shape.kind, material: input?.material, quality: input?.quality })
            };
          }) as unknown as AgentValue;
        });
      if (command.operation === "color") {
        if (!["shared", "instance"].includes(command.scope))
          throw new Error("INVALID_ARGUMENT: Color scope must be shared or instance.");
        await editWaterColor(edit, path, command.id, command.color, command.scope);
        return { status: "prepared-in-draft", id: command.id };
      }
      if (command.operation === "texture") {
        await editWaterTexture(edit, path, command.id, command.path, command.scope);
        return { status: "prepared-in-draft", id: command.id };
      }
      const id = await editWaterSource(edit, path, command);
      return { status: "prepared-in-draft", id };
    }
  };
  return {
    tools: [tool],
    definition: {
      toolNames: [tool.name],
      scriptApi: {
        hostNotes:
          "水体作者编辑：读取 declare/editor/water/authoring.md 和 declare/editor/water/WaterAuthoring.d.ts，再调用 tools.water.author。",
        documents: [
          {
            path: "declare/editor/water/authoring.md",
            content:
              "Source Scene/Prefab 组件是唯一作者模型。先 list/get 发现稳定组件 ID。UI 与工具共用公共事务和历史；形状用局部米制坐标，放置归 Entity Transform。quality 是组件值属性，支持按字段微调，省略时使用当前水体类型默认值；不引用 Quality 资产，预算与材质、形状独立。手动床面不支持雕刻；host Terrain 由宿主协调。隐藏保留查询，禁用退出查询。color 必须显式选择共享或实例副本。工具返回 prepared-in-draft，外层事务 commit/activate 后才能报告接受和运行结果；保存另行等待。"
          }
        ],
        entries: [
          {
            name: tool.name,
            description: "读取、新建、微调、批量编辑、启禁用及移除 Source 水体，或修改共享/实例材质颜色与法线引用。",
            moduleId: "water/WaterAuthoring.d.ts"
          }
        ],
        modules: [{ id: "water/WaterAuthoring.d.ts", source: declaration, imports: [], toolNames: [tool.name] }]
      }
    }
  };
}
