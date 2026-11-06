---
name: assets-search-cloud
description: 项目缺少合适资源，需要从云端素材库查找时使用。
---

# 检索云端素材

项目缺少合适资源时，用 search_assets 搜索外部素材库。把玩家的话提炼成资产名称或特征关键词，例如“在我面前放一架直升机”搜索“直升机”。位置和数量在场景编辑时处理。

按返回的 descriptionPath 调用 read_asset_descriptions，检查少量候选的外观、尺寸和使用说明。分页和查询调整遵循工具契约。

搜索结果是候选，不是项目资产。

- 资产库的 assetType 不会自动映射到 Editor 资产类型。
- descriptionPath 指向说明，assetPaths 指向来源物料。它们都不是导入后的项目路径。
- 用 `source_text({action: "read", path})` 读取来源中的 README 或 manifest。可以用从 1 开始的 offset 和行数 limit 分段读取。当前 source_text 只提供 read 操作。

选定后按[导入](skills/assets/import/SKILL.md)进入项目。
