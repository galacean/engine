---
name: assets-import
description: 把外部来源的文件或文件夹导入项目时使用。
---

# 导入资产

接口见[导入 API](declare/editor/native/api.d.ts)。当前 editor.asset.import({source, path}) 接收宿主来源中的文件或普通文件夹，path 是未占用的项目目标虚拟路径。对于搜索返回的 assetPaths，将其加上 /oss/ 前缀作为 source，例如 assets/model/tree/tree.glb 对应 /oss/assets/model/tree/tree.glb。对于已有完整 /oss/... 的来源路径，不要重复添加前缀。

导入器会从 catalog 解析 /oss/assets/... 对应的 CDN 物料，按需下载并在一次编辑事务中写入项目。导入普通资产目录时可用 describe.json 所在目录作为 source。无需自行下载、构造 CDN URL 或改写 project.json。外部来源路径不能直接写入项目的 {$ref: ...}；使用导入返回的项目路径。来源不可访问时报告导入失败，不要解释成搜索无结果。

- 导入有依赖的普通文件夹时，包含完整依赖；导入器会重写文件内的相对引用。缺依赖会拒绝。
- 目标重名时检查错误中的占用路径，复用符合需求的已有资产或选择新路径；不会覆盖或合并已有目录。
- 当前支持自包含的 GLB 和 PNG/JPEG 等已注册格式。普通目录不等于 .package。当前接口没有 Editor 的 GRP 包导入能力，不能把包文件当作文件夹导入。
- 后续引用使用导入返回的项目虚拟路径。提交成功后，无需再列出资产表来确认同一路径；类型或内容影响下一步操作时，使用 asset.info 或 asset.read。先前已提交的导入不会因为后续操作失败而自动撤回。
