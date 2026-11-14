---
name: scene-nodes
description: 创建、查询、移动、删除 Scene 节点，调整层级或搭建场景内容时使用。不用于世界系统管理的对象（见 world-objects）。
---

# Scene 节点

Scene 作者分组、灯光节点和层级从这里进入：先读 project.json 找到活动 Scene，再用 `editor.entity.list` 查询作者记录。自动生成的运行时网格不是 Scene 作者分组。查询 Scene 结构时，不需要递归枚举所有生成网格。

## 查询

`editor.entity.list({scene,name?,parentId?,limit?,cursor?})` 返回有界的实体摘要页 `{items,total,revision,nextCursor}`，包括关联的 Prefab 成员。

- name 按子串过滤，区分大小写。
- parentId 为 null 时选择根节点。
- 按 nextCursor 继续时，过滤条件不变。结果变化后，旧 cursor 会被拒绝。
- 完整属性、子节点和组件 ID 用 `editor.entity.read({scene,id})` 读取。

展开的成员只用于读取，不能替代 Scene 文档。

## 修改

Entity 的变换是局部坐标，旋转单位是度。

`entity.reparent({scene,id,parentEntityId,preserveWorld?})` 移动 Scene 节点或实例的本地新增内容。默认保持作者世界位姿。parentEntityId 为 null 表示移到 Scene 根。`preserveWorld:false` 保持局部位姿。

把 Scene 子树移入可编辑的 Prefab 时，它会转为本地新增内容，Source ID 不变。移动继承的模板节点、形成循环或无法表示的变换，都会在修改前被拒绝。

`entity.revert({scene,id,keys?})` 恢复继承的 Entity 属性。省略 keys 时恢复所有支持的属性。

输入已确定，且不需要根据中间结果作选择时，在同一次 execute 草稿中配置相互依赖的节点、组件和资源。

## 相关

- 编辑如何生效：[草稿与提交](skills/scene-nodes/references/draft-and-commit.md)
- 项目文件与路径：[项目文件](skills/scene-nodes/references/project-files.md)
- 给节点加组件或改属性：[components](skills/components/SKILL.md)
- 放置资产或 Prefab：[assets](skills/assets/SKILL.md)
- 接口：[原生编辑 API](declare/editor/native/api.d.ts)、[Scene/Prefab 数据](declare/editor/native/source.d.ts)
