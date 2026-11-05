---
name: scene-nodes
description: 创建、查询、移动、删除 Scene 节点，调整层级或搭建场景内容时使用。不用于世界系统管理的对象（见 world-objects）。
---

# Scene 节点

Scene 作者分组、灯光节点和层级从这里进入：先读 project.json 找活动 Scene，再用 editor.entity.list 查询作者记录。自动生成的运行时网格不等于 Scene 作者分组，查询 Scene 结构无需递归枚举所有生成网格。

## 查询

editor.entity.list({scene,name?,parentId?,limit?,cursor?}) returns {items,total,revision,nextCursor}, a bounded page of entity summaries including linked Prefab members. name filters by case-sensitive substring and parentId:null selects roots. Follow nextCursor with unchanged filters; changed results reject stale cursors. Use editor.entity.read({scene,id}) for complete properties, children and component IDs. Expanded members are a read view, not a replacement Scene document.

## 修改

Entity transforms are local coordinates; rotation is in degrees. entity.reparent({scene,id,parentEntityId,preserveWorld?}) moves Scene nodes or instance-local additions and preserves authored world pose by default; null means Scene root and preserveWorld:false keeps local pose. Moving a Scene subtree into an editable Prefab converts it to local additions with the same Source IDs. Moving inherited template nodes, cycles and unrepresentable transforms reject before mutation. entity.revert({scene,id,keys?}) restores inherited Entity properties; omitted keys revert all supported properties.

输入已确定且不需要模型根据中间结果作选择时，在同一次 execute 草稿中配置相互依赖的节点、组件和资源。

## 相关

- 编辑如何生效：[草稿与提交](skills/scene-nodes/references/draft-and-commit.md)
- 项目文件与路径：[项目文件](skills/scene-nodes/references/project-files.md)
- 给节点加组件或改属性：[components](skills/components/SKILL.md)
- 放置资产或 Prefab：[assets](skills/assets/SKILL.md)
- 接口：[原生编辑 API](declare/editor/native/api.d.ts)、[Scene/Prefab 数据](declare/editor/native/source.d.ts)
