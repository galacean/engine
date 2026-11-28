---
name: components
description: 给节点添加或移除组件、读取或修改组件属性、调用组件方法时使用。系统组件有专门的 Skill 时优先使用对应 Skill。
---

# 组件

原生编辑都通过 `editor.asset`、`editor.entity` 和 `editor.component`。普通文档使用外部文件工具。应用的 `tools` 命名空间是独立的。

## 查询

- `editor.component.query({scene, entityId?, id?, type?})` 查询当前作者草稿，返回 `{ items }`（包括本次 execute 之前的编辑）。
- `editor.component.read` 返回作者属性。
- 查询已注册的字面量类型时，`items` 中的元素还会提供带类型的实时方法。
- `editor.component.query({type})` 不传 scene 时查询当前运行时，同样返回 `{ items }`。
- 新组件要提交并激活后，才能调用实时方法。
- 组件移除后，同一 Scene 范围的查询不再返回它。
- 增删改组件后，外层 `execute` 返回 `committed` 且无 `runtimeErrors` 即已完成，无需额外调用 `tools.runtime.*` 复查。

名称只用于发现。组件身份由 scene、entityId、id、type 确定。带类型的系统代理每次实时调用都会重新解析身份。不要使用 Engine 的 instanceId，也不要假设已删除的组件仍然存在。

## 修改

组件属性使用 Editor 源数据结构：普通数值与结构体直接写 JSON（如 `distance: 10`、`color: { r: 1, g: 1, b: 1, a: 1 }`），资产写 `{ $ref: virtualPath }`，层级引用写 `{ $entity: entityId }` 和 `{ $component: componentId }`。

MeshRenderer 的 `mesh` 引用网格资产，`material` 引用材质资产（编译为 `setMaterial`）。常用内置引擎组件持久化 `props` 与声明直链如下（无需 `glob`/`grep` 盲搜 `declare/engine/`）：

| 组件 `type` | 常用顶层 `props` 字段（含父类 `enabled`） | 声明路径（仅在缺字段时按需直读） |
| --- | --- | --- |
| `MeshRenderer` | `mesh: { $ref: meshPath }`, `material: { $ref: matPath }`, `enabled?: boolean` | `declare/engine/node_modules/@galacean/engine-core/types/mesh/MeshRenderer.d.ts` |
| `PointLight` | `distance?: number`, `color?: { r, g, b, a }`（**无 `intensity` 属性**，调亮度直接缩放 HDR `color` 的 RGB 分量）, `shadowStrength?: number`, `enabled?: boolean` | `declare/engine/node_modules/@galacean/engine-core/types/lighting/PointLight.d.ts`（父类 `Light.d.ts`） |
| `DirectLight` | `color?: { r, g, b, a }`（**无 `intensity` 属性**，调亮度直接缩放 HDR `color` 的 RGB 分量）, `shadowStrength?: number`, `shadowNearPlaneOffset?: number`, `enabled?: boolean` | `declare/engine/node_modules/@galacean/engine-core/types/lighting/DirectLight.d.ts` |
| `Camera` | `fieldOfView?: number`, `nearClipPlane?: number`, `farClipPlane?: number`, `enabled?: boolean` | `declare/engine/node_modules/@galacean/engine-core/types/Camera.d.ts` |

如需修改其他组件属性，再按对应声明确定字段名（父类属性同样直接写在 `props` 顶层），用组件 ID 和变更的属性调用 `component.update`。

以下操作会重建组件以恢复加载器默认值：移动组件、移除已序列化的属性、编辑显式 setter 调用。构建组件时，所属 Entity 会暂时停用，属性和引用绑定后再恢复。投影部分失败后，下一次原生编辑或撤销会重新同步作者组件，并重置它们的瞬时状态。

## 相关

- 编辑如何生效：[草稿与提交](skills/scene-nodes/references/draft-and-commit.md)
- Prefab 实例上的覆盖：[使用 Prefab](skills/assets/use-prefab/SKILL.md)
- 接口：[原生编辑 API](declare/editor/native/api.d.ts)、[Scene/Prefab 数据](declare/editor/native/source.d.ts)、[Engine 声明](skills/scripting/references/runtime-modules.md)
