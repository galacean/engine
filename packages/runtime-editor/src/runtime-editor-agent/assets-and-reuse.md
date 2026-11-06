# 资产与可复用层级

在导入素材、把资产放进场景或复用一组节点时读取本篇。

## 查找并选择资产

先复用已知的项目资产信息。尚不清楚是否有合适资源时，按需查询项目清单、路径或资产说明。已有实例与资产不同：复用资产通常仍需创建或配置一个场景实例。

宿主提供 search_assets 时，在项目缺少合适资源的情况下搜索外部素材库。把玩家表达提炼为资产名称或特征关键词，例如“在我面前放一架直升机”搜索“直升机”；位置与数量在场景编辑时处理。按工具返回的 descriptionPath 调用 read_asset_descriptions，检查少量候选的外观、尺寸与使用说明。分页及查询调整遵循工具契约。

搜索结果是候选，不是项目资产。资产库的 assetType 不是 Editor 资产类型的自动映射。descriptionPath 指向说明，assetPaths 指向来源物料；它们都不是导入后的项目路径。通过 source_text({action: "read", path}) 读取来源中的 README 或 manifest；可使用从 1 开始的 offset 和行数 limit 分段读取。当前 source_text 只提供 read 操作。

## 从来源导入项目

导入接口见[导入 API](../../../editor/declare/native/api.d.ts)。当前 editor.asset.import({source, path}) 接收宿主来源中的文件或普通文件夹，path 是未占用的项目目标虚拟路径。对于搜索返回的 assetPaths，将其加上 /oss/ 前缀作为 source，例如 assets/model/tree/tree.glb 对应 /oss/assets/model/tree/tree.glb。对于已有完整 /oss/... 的来源路径，不要重复添加前缀。

导入器会从 catalog 解析 /oss/assets/... 对应的 CDN 物料，按需下载并在一次编辑事务中写入项目。导入普通资产目录时可用 describe.json 所在目录作为 source。无需自行下载、构造 CDN URL 或改写 project.json。外部来源路径不能直接写入项目的 {$ref: ...}；使用导入返回的项目路径。来源不可访问时报告导入失败，不要解释成搜索无结果。

- 导入有依赖的普通文件夹时，包含完整依赖；导入器会重写文件内的相对引用。缺依赖会拒绝。
- 目标重名时检查错误中的占用路径，复用符合需求的已有资产或选择新路径；不会覆盖或合并已有目录。
- 当前支持自包含的 GLB 和 PNG/JPEG 等已注册格式。普通目录不等于 .package。当前接口没有 Editor 的 GRP 包导入能力，不能把包文件当作文件夹导入。
- 后续引用使用导入返回的项目虚拟路径。提交成功后，无需再列出资产表来确认同一路径；类型或内容影响下一步操作时，使用 asset.info 或 asset.read。先前已提交的导入不会因为后续操作失败而自动撤回。

## 导入后的使用

| 资产 | 使用方式 |
| --- | --- |
| 网格与材质 | 在节点上配置 MeshRenderer，mesh 和 material 使用已导入资产的 {$ref: virtualPath}。基础几何体格式见[PrimitiveMesh](../../../editor/knowledge/native/primitive-mesh.md)。 |
| 图片 | PNG/JPEG 导入为 Texture。作为材质贴图时按[材质格式](../../../editor/knowledge/native/README.md)配置；做 UI 或精灵还需要对应的 Sprite、显示组件和宿主支持，不能把 Texture 当作 Sprite。 |
| GLB 模型 | GLTF 资产不是 Prefab。当前可通过组件配置或 JSON 声明模型引用，由 Script 加载 GLTFResource 并 instantiateSceneRoot；资源引用和按需加载方式见[配置资产](../../../engine/knowledge/configured-assets.md)。这种运行时实例不是可通过 editor.entity 编辑的作者层级。 |
| 已有 Prefab | 使用 editor.entity.create({scene, name, prefab: virtualPath}) 创建关联实例，按当前声明编辑节点和组件。 |
| 音频或其他格式 | 先确认当前宿主有对应导入格式与组件声明。音频即使导入也需绑定播放组件并实际播放；不能假设 Editor 的音频管理器在本宿主中存在。 |

Script 资产中调用 Engine 方法；execute 代码中调用 Editor 声明的方法。不要在 execute 中直接使用 GLTFResource 实例或照搬 Editor 的 gltf.create、instantiate、unpack 等未提供的方法。

## 保留模型结构，明确复用边界

完整模型包含网格、材质、节点变换和可能的动画。单独选一个网格子资源只得到几何，不包含完整节点层级。整体摆放优先保留模型根节点及其子层级；需要独立几何时检查所需变换，不猜测子资源索引。

模型外形可能偏离根节点原点。结合包围盒、父子变换、缩放和朝向摆放；多个模型根节点位置相同不意味着外形已经对齐。修改材质前检查实际引用，判断应该改共享材质还是当前实例绑定，避免意外影响其他对象。

已有 Prefab 的共享模板和放置实例分别维护。修改哪个对象取决于用户希望影响一处还是所有实例。当前未提供从节点生成 Prefab 或解除实例关联的编辑接口；不要推断存在这些能力。Script 中的运行时克隆也不会自动生成 Prefab 资产。

## 验证使用效果

先检查 execute 返回的提交回执及编译、运行错误。导入成功只证明资产进入项目；提交成功不等于画面可见或玩法可用。

已有结果足以确认的配置不重复查询。需要确认尚未覆盖的实例状态时，按已返回的对象身份查询；不为寻找同一对象而遍历整个场景。外观仍需确认且宿主提供 snapshot 时查看画面。声音与交互使用相应的运行证据。

图像点选用于获取画面中对象的身份，不是创建成功的判据。点选未命中不能证明对象不存在。已知对象身份时，根据尚未解决的问题选择查询或观察。

批量复制前，先确认一个实例已满足本次任务的位置、比例、可见性及必要的行为要求。比如放入直升机模型只完成外观放置；能否驾驶或飞行还取决于玩法实现。完成说明应对应已验证的结果。

## 查看项目资产

先用 `editor.asset.info({path})` 查看类型和已填写的说明，不下载完整资产。需要了解内容时用 `editor.asset.read({path})`：脚本文本为 `kind: "text"`，JSON 等结构为 `kind: "structured"`，PNG/JPEG 为 `kind: "image"`（尺寸和格式），GLB 为 `kind: "model"`（场景、节点、网格、材质和静态模型局部包围盒）。读取模型不会告诉你场景实例的世界坐标；用 Entity/Component 查询实例。其他编码会明确报不支持，可用 VFS read 查看原始文本或二进制描述。

只有注册资产有同名 `.meta`。项目清单、文件夹、README、知识和声明不生成 `.meta`；未填写的资产 summary/usage 为空。
