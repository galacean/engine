import { recoveryStatus } from "@galacean/engine-ai-chat/ai-chat/model-recovery";
import type { AgentSessionSnapshot } from "@galacean/engine-ai-chat/ai-chat/index";

/** Pure projection: remounting a HUD gives the same text without replaying events. */
export function projectSeedWorldTask(snapshot: AgentSessionSnapshot): { text?: string; details: string } {
  const task = snapshot.current;
  if (!task) return { details: "" };
  const entries = [task.input];
  let commentary: string | undefined;
  let text = task.input;
  const append = (value: string | undefined) => { if (value && entries.at(-1) !== value) entries.push(value); };
  for (const event of task.progress) {
    switch (event.kind) {
      case "recovery": commentary = undefined; text = recoveryStatus(event.recovery); break;
      case "model":
        if (!event.decision) { commentary = undefined; text = "正在分析请求"; break; }
        commentary = event.decision === "final" ? undefined : event.commentary;
        { const next = commentary ?? (event.decision === "read_tool" ? "查阅相关操作说明"
          : event.decision === "list_tool" ? "查找相关资料和资源"
          : event.decision === "search_tool" ? "搜索相关文件内容"
          : event.decision === "snapshot" ? "查看当前画面"
          : event.decision === "pick" ? "定位画面中的对象" : undefined);
          if (next) { text = next; append(next); } }
        break;
      case "tool": {
        const action = describeTool(event.tool);
        const next = event.ok === undefined ? `正在${action}` : event.ok ? `${action}的结果已返回` : `${action}遇到问题`;
        append(next); text = event.ok !== false && commentary ? commentary : next; break;
      }
      case "script": {
        const next = event.ok === false ? "这一步遇到问题，正在根据执行结果调整"
          : event.runtimeErrors ? "本步执行出现运行问题，需要进一步处理"
          : event.committed ? "本步修改已提交" : undefined;
        append(next);
        if (event.ok === false || event.runtimeErrors) commentary = undefined;
        text = commentary ?? next ?? text; break;
      }
      case "input_error": append(`补充输入未能准备：${event.text}（${event.message}）`); break;
      case "input": append(`收到补充：${event.text}`); break;
    }
  }
  if (snapshot.state === "preparing") text = "正在准备图片和输入…";
  else if (snapshot.state === "stopping") text = "正在停止…";
  else if (task.outcome) text = task.outcome.message;
  if (snapshot.continuationBlocked) text = [text, "请先核对世界状态，暂不能继续。"].filter(Boolean).join("\n");
  if (task.outcome) append(task.outcome.message);
  return { text, details: entries.join("\n\n") };
}

/** Product wording belongs to this application's presentation, not the system prompt. */
function describeTool(name: string): string {
  const direct: Record<string, string> = { read: "读取文件", glob: "查找文件", grep: "搜索文件内容", write: "写入文件", edit: "修改文件", delete: "删除文件", snapshot: "查看当前画面", pick: "定位画面中的对象" };
  if (direct[name]) return direct[name];
  const parts = name.split(".");
  const method = parts.at(-1)!;
  const domain = name.startsWith("editorComponents.") ? parts[1]
    : name.startsWith("world.parameters") ? "parameters"
    : name.startsWith("world.animals") ? "animals" : parts[0];
  const subjects: Record<string, string> = {
    time: "时间设置", celestial: "日照设置", atmosphere: "天气设置", terrain: "地形",
    water: "水域", vegetation: "植被", world: "场景对象", parameters: "场景配置",
    animals: "动物", PlannedMasonrySystem: "建筑", MasonrySystem: "建筑构件",
    FarmingSystem: "农田", entity: "场景对象", component: "对象属性", asset: "素材", document: "项目文档"
  };
  const subject = subjects[domain];
  const query = /^(get|read|list|query|inspect|describe|catalog|capabilities|decorationCatalog)/i.test(method);
  const check = /^(preflight|verify|receipt)/i.test(method);
  if (!subject) return query ? "查询相关信息" : "执行当前操作";
  const verb = query ? "查询" : check ? "检查" : /^(create|spawn|add)/i.test(method) ? "创建"
    : /^(delete|remove)/i.test(method) ? "移除" : "调整";
  return verb + subject;
}
