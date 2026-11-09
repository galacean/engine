---
name: assets
description: 查找、导入、查看、删除资产，或把模型、图片、Prefab、网格和材质用到场景里时使用。
---

# 资产

先复用已知的项目资产信息。不确定有没有合适资源时，按需查询项目清单、路径或资产说明。已有实例和资产是两回事：复用资产通常仍要创建或配置一个场景实例。

## 按任务读取

| 当前任务 | 子 Skill |
| --- | --- |
| 把外部来源导入项目 | [导入](skills/assets/import/SKILL.md) |
| 查看项目资产的类型和内容 | [查看](skills/assets/inspect/SKILL.md) |
| 使用 GLB 模型 | [使用模型](skills/assets/use-model/SKILL.md) |
| 使用 PNG/JPEG 图片 | [使用图片](skills/assets/use-image/SKILL.md) |
| 放置或修改 Prefab | [使用 Prefab](skills/assets/use-prefab/SKILL.md) |
| 基础几何体、网格和材质 | [网格与材质](skills/assets/mesh-material/SKILL.md) |
| 删除资产、处理引用 | [删除](skills/assets/delete/SKILL.md) |

常见组合可以一轮读完：

- 放置外部模型：读检索和使用模型。使用模型里有从导入到放置的完整示例。
- 放置项目已有的 Prefab：只读使用 Prefab。

音频或其他格式：先确认当前宿主有对应的导入格式和组件声明。音频导入后还要绑定播放组件并实际播放。不能假设 Editor 的音频管理器在本宿主中存在。

接口：[原生编辑 API](declare/editor/native/api.d.ts)、[Scene/Prefab 数据](declare/editor/native/source.d.ts)

## 验证使用效果

先检查 execute 返回的提交回执，以及编译和运行错误。导入成功只证明资产进入了项目。提交成功不等于画面可见或玩法可用。

已有结果足以确认的配置，不重复查询。需要确认实例状态时，按已返回的对象身份查询，不为找同一个对象遍历整个场景。外观仍需确认且宿主提供 snapshot 时，查看画面。声音和交互使用相应的运行证据。

批量复制前，先确认一个实例已满足本次任务的位置、比例、可见性和行为要求。例如放入直升机模型只完成了外观放置，能否驾驶或飞行取决于玩法实现。完成说明要对应已验证的结果。
