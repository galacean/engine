---
name: assets-delete
description: 删除项目资产或查询谁在引用某个资产时使用。
---

# 删除资产

Before deleting an existing asset, call editor.asset.references with its exact virtual path. After successful deletion, use editor.asset.list to confirm absence; references requires an existing asset and rejects a deleted path. It returns incoming authoring references, including static Script imports and assetUrl calls. Inspect the returned caller paths and unlink or replace their references before calling asset.delete. Both operations support registered asset formats, including PNG/GLB; the ability to edit file contents is unrelated. asset.delete independently rechecks the current draft and rejects with caller paths while references remain. Unknown caller formats or unavailable reference data reject rather than treating the asset as unused.

Declare candidate resources in component properties or JSON configuration assets using {$ref: virtualPath}; Scripts select from these references instead of constructing resource paths. See [配置资产](skills/scripting/references/configured-assets.md). The Editor maintains direct dependencies in project.json and queries their reverse index; missing dependency information is not an empty list. Even with no incoming references, registered Scenes and runtime-owned assets remain protected; release component ownership before deleting its assets. Successful deletion removes the asset table entry, content and .meta through the normal save/undo transaction.

A subresource reference protects its containing asset. For example, a material texture value {url: "Can.glb", key: "textures[0]"} references Can.glb; query Can.glb to find the material. asset.delete rejects while this external reference remains.
