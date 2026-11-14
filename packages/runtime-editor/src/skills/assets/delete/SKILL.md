---
name: assets-delete
description: 删除项目资产或查询谁在引用某个资产时使用。
---

# 删除资产

删除已有资产前，用准确的虚拟路径调用 `editor.asset.references`。它返回指向该资产的作者引用，包括静态 Script import 和 `assetUrl` 调用。检查返回的调用方路径，先解除或替换这些引用，再调用 `asset.delete`。

- 两个接口都支持已注册的资产格式，包括 PNG 和 GLB。能否编辑文件内容与此无关。
- `asset.delete` 会重新检查当前草稿。还有引用时，它拒绝删除并返回调用方路径。
- 调用方格式未知或引用数据不可用时，接口会拒绝，不会把资产当作未被使用。
- 删除成功后，用 `editor.asset.list` 确认资产已不存在。`references` 要求资产存在，查询已删除的路径会被拒绝。

候选资源用 `{$ref: virtualPath}` 声明在组件属性或 JSON 配置资产中。Script 从这些引用中选择，不自行拼接资源路径。详见[配置资产](skills/scripting/references/configured-assets.md)。

Editor 在 project.json 中维护直接依赖，并按反向索引查询。依赖信息缺失不等于没有引用。即使没有引用，已注册的 Scene 和运行时持有的资产仍受保护。删除这类资产前，先释放组件的持有关系。删除成功后，资产表记录、内容和 `.meta` 通过正常的保存和撤销事务一起移除。

子资源引用也会保护它所在的资产。例如材质贴图值 `{url: "Can.glb", key: "textures[0]"}` 引用了 `Can.glb`。查询 `Can.glb` 可以找到这个材质。该引用存在时，`asset.delete` 会拒绝删除。
