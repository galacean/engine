---
name: vegetation
description: 创建、查询、移动、删除或调整树木、灌木、草地、花和植被材质/生态配置时使用。
---

# 植被

## 选择操作

从接口索引中选择：

- 创建植物：用 `vegetation.create` 按植物类别（`plant: "tree" | "shrub" | "grass" | "flower" | "aquatic-grass"`）与位置/分布创建。`vegetation.create` 不支持直接传入具体树种名（无 `species` 参数，**不要**去 `vegetation.config`、`spatial.config` 或 `declare/engine/` 中搜索 `species` 参数，也不要反复试种再删除）。用户提到具体树种（如松树、白桦、橡树）时，**不要反问停住**，直接按请求的坐标、数量和范围传 `plant: "tree"` 完成种植（由落点区域生态生成最接近的自然树种），并在回复中如实说明实际按区域生态完成种植。
- 查找、检查或删除植物：用 `vegetation.query`、`vegetation.inspect`、`vegetation.delete`。
- 移动或重随作者植物：单棵树 / 单株灌木用 `vegetation.update` 只支持改 `patch.target`（位置）与 `patch.seed`（形态种子），**不支持**单株缩放（scale）或旋转（rotation），也没有可编辑的场景 `Entity` / `Transform` 组件（不要去查场景节点、组件或运行时对象，不要读原生编辑 API）。若用户要求只放大/缩小或旋转单棵树/单株灌木，无需预先读取 `vegetation.config.get` 或材质槽，直接如实说明不支持单株缩放/旋转，并询问是否同意通过 `vegetation.config` 调整该物种整体尺寸（会影响同物种全部实例）。目标位置见 [spatial](skills/spatial/SKILL.md)。
- 修改树的外观与颜色：先用 `vegetation.inspect` 读取详情。只有返回了 `treeRecipeId` 时才支持用 `vegetation.update` 的 `treeShape` 修改共享树形外观（槽位 `1`–`7`，`0` 为基线只读）。无 `treeRecipeId` 的原生程序化树、单株灌木及局部花丛/草丛均不支持 `treeShape`，也没有独立场景节点或材质组件（不要去查场景节点、组件或运行时对象，不要读原生编辑 API），不支持单株或局部改色。
- 修改植被材质配色：用 `vegetation.materials.inspect` / `vegetation.materials.apply` 按部位、生态层或 `proceduralAssetId`（`filter.assetIds`）设置共享材质线性 RGB（同物种所有实例共用）。若用户要求只改单棵树、单株灌木或某一小片花草的颜色而当前只支持整物种共享材质，不要修改全局物种参数，也无需预先读取材质槽或遍历全图统计同种植物，直接向用户如实说明不支持单株/局部改色并询问是否同意按该物种整体改色。
- 修改区域植被或生态配置：用 `vegetation.config.get` / `vegetation.config.update` / `vegetation.config.reset`（组件包括 `landscape`、`landscapePopulation`、`landscapeInfluence`、`flowers`、`flowerInfluence`、`grassAppearance`、`surfacePalette`、`plantMaterial`）。

## 选择引用

历史记录能确定目标植物时，复用创建或修改结果中的 `assetRef`，也可以复用 `vegetation.query` 结果的 `ref`。需要当前详情时，用这个引用调用 `vegetation.inspect`。身份不明确时，用 `vegetation.query` 查找。

`vegetation.query` 返回资产投影，含 `type`、`ref`，以及可选的 `position`、`bounds`、`tags`、`relations`。详细属性用 `vegetation.inspect` 读取。查询结果不保证有 `name` 字段。

执行要求特定 kind 或 source 的操作前，先检查 `ref.kind` 和 `ref.source`。查询过滤只筛选运行结果，不会缩小声明的联合类型。保留返回的引用，不要构造字段被放宽成 string 的变量，也不要使用类型断言。

修改位置和种子要求是作者植被。自然树支持声明的共享外观操作；自然树、灌木和蘑菇支持通过 `vegetation.delete` 移除。

## 检查结果

返回判断请求所需的修改字段。`resolvedEffect` 提供了实际目标位置时，也要返回。用修改结果和最终的 execute 回执判断是否完成。缺少必要证据或证据与请求冲突时，查询同一个 `assetRef`。

对象不在当前画面中，不能证明修改失败。

## 区域植被与生态配置

用 `vegetation.config.get/update/reset` 读写区域植被与生态配置。单株植物的请求不要修改全局物种参数。

`vegetation.query` 返回已发布的原生树和花区，其中 `proceduralAssetId` 和 `planningEntityId` 指向参数所有者。林下实例是流式生成的派生结果，不是单独的作者对象，要修改它们所在区域的生态或花参数。相机驻留的数量不是保存的种群数量。

## 接口索引

<!-- API_INDEX: generated from executable contracts at load time. -->

<!-- ASSET_TYPES: generated from inspectable asset declarations at load time. -->

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->
