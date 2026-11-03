# 配置声明资源，Script 选择和使用

系统使用的候选资源声明在 Scene/Prefab 的组件属性，或 JSON 配置资产中。资产引用使用 `{ "$ref": "Models/Birch.glb" }`，不要把候选资源藏在普通路径字符串、运行时拼接的文件名或临时加载 URL 中。

Editor 自动从配置提取直接依赖，维护 `project.json` 的 `files[].dependencies`。修改配置用 `editor.component.update` 或 `editor.asset.update`；不要手工编辑依赖清单。声明所有可能选择的候选资源，包括本次没有选中的资源。

## 组件直接接收资源

Scene/Prefab 的 Script 组件可以配置：

```json
{
  "type": "Script",
  "script": { "$ref": "Scripts/Forest.ts" },
  "props": {
    "trees": [
      { "$ref": "Models/Birch.glb" },
      { "$ref": "Models/Pine.glb" }
    ]
  }
}
```

Engine 将这些引用解析为实际资源对象，Script 的 `trees: GLTFResource[]` 从中选择使用即可。场景直接依赖 Script 和两个模型。此方式会随组件加载候选资源；候选较多、希望按需加载时使用下面的配置资产方式。

## JSON 配置声明候选资源，按需加载

`Configs/Forest.json`（类型 `JSON`）：

```json
{
  "trees": [
    { "name": "白桦", "model": { "$ref": "Models/Birch.glb" } },
    { "name": "松树", "model": { "$ref": "Models/Pine.glb" } }
  ]
}
```

组件的 `props.config` 设置为 `{ "$ref": "Configs/Forest.json" }`。Engine 为它注入 `JSONAsset`；JSON 的 `data` 保留原始 `$ref` 描述，不会自动加载其中的模型。

`Scripts/Forest.ts`：

```typescript
import { Script, JSONAsset, GLTFResource } from "@galacean/engine";

interface ForestConfig {
  trees: Array<{ name: string; model: { $ref: string } }>;
}

export default class Forest extends Script {
  config!: JSONAsset;

  async createTree(index: number): Promise<void> {
    const { trees } = this.config.data as ForestConfig;
    const candidate = trees[index];
    if (!candidate) throw new Error("不存在这个候选树木");
    const model = await this.engine.resourceManager.load<GLTFResource>(candidate.model.$ref);
    if (this.destroyed) return;
    this.entity.addChild(model.instantiateSceneRoot());
  }
}
```

这里动态变化的是数组索引，资源路径来自已声明的引用。Engine 的 ResourceManager 接受项目虚拟路径，不需要拼接实际 URL，也不需要对变量调用 `assetUrl`。

直接依赖为：

```text
scene.json → Scripts/Forest.ts、Configs/Forest.json
Configs/Forest.json → Models/Birch.glb、Models/Pine.glb
```

不要把这两个模型再写进场景或脚本的直接依赖。即使本次只生成白桦，松树仍是配置中的合法候选，删除松树前应先从配置中移除它。

只读操作、资源加载和缓存释放不改变依赖。资产编辑、导入、撤销与保存同步维护依赖；未知依赖不等于空列表。静态 `assetUrl("literal")` 仍可用于固定资源；它的字面量检查不能被变量、别名或动态导入绕过。任意用户 Script 不是安全沙箱，Editor 不声称能推断未按此契约声明的动态加载。
