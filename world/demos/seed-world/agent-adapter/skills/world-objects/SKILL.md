---
name: world-objects
description: 查询、检查、删除世界对象，或管理对象标签和选区时使用。树木、地貌、水体等由世界系统管理的对象从这里定位；Scene 节点见 scene-nodes。
---

# Object Query and Management

## Usage Guide

Use the current API Reference Index to choose this host's object model.

- Known world asset: reuse its complete `ref` or the `assetRef` from a previous create/update result. Read current details with `world.inspect` when needed.
- Unknown world asset: find it with `world.query`. Query results carry identity in `item.ref`: `id`, `kind`, `domain`, and `source`.
- Object identified by screenshot: use the `pick` reference to read its current runtime identity and author mapping. Choose its editing API from the returned ownership information.
- Planning component: use [规划参数](skills/world-objects/parameters/SKILL.md).
- Object managed by a system: use the corresponding system guide to find its query and editing interfaces.

Use the schema's scope and the returned kinds, IDs, and components. Runtime IDs and planning entity IDs are not world Asset Refs.
Narrow queries by component or kind. Follow `nextOffset` if you need more results. Return only the fields needed for the next decision.
Read type-specific fields from their declarations. Use tags and named selections only when the API index lists those APIs.

Deletion and undo follow each capability's contract. `editor.history.query({})` lists undoable and redoable asset transactions, next actionable entry first. Pass an ordered contiguous list of IDs to `editor.history.undo` or `editor.history.redo` in a standalone execute. This restores author assets, not elapsed simulation or independently committed gameplay commands. New edits clear redo. History is session-scoped.

Ownership and spatial containment are different relationships. A parent reference identifies an owner; `relatedTo.relation: "inside"` tests geometric containment. Reuse returned refs and follow nextOffset when paginated.

## API Reference Index

<!-- API_INDEX: generated from executable contracts at load time. -->

世界对象的类型字段见[资产类型](skills/world-objects/references/asset-types.md)。
