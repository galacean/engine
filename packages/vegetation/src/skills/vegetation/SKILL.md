---
name: vegetation
description: 创建、查询、移动、删除或调整树木、灌木、草地、花和植被材质/生态配置时使用。
---

# 植被

## 选择操作

从接口索引中选择：

- 创建植物：用 `vegetation.create` 按植物类别（树、灌木、草、花、水草）与位置、分布创建。树木取自落点区域的生态，按返回的实际株数汇报。用户在意外观时，按下方的树形与材质能力选择可调整的属性。树种是明确条件时，先说明可按当地生态种植，或按支持的范围调整树木外观，待用户接受替代方案后再编辑。
- 查找、检查或删除植物：用 `vegetation.query`、`vegetation.inspect`、`vegetation.delete`。
- 移动或重随作者植物：单棵树 / 单株灌木用 `vegetation.update` 修改 `patch.target`（位置）与 `patch.seed`（形态种子），**不支持**单株缩放（scale）或旋转（rotation），也没有可编辑的场景 `Entity` / `Transform` 组件（不要去查场景节点、组件或运行时对象，不要读原生编辑 API）。若用户要求只放大/缩小或旋转单棵树/单株灌木，无需预先读取 `vegetation.config.get` 或材质槽，直接如实说明不支持单株缩放/旋转，并询问是否同意通过 `vegetation.config` 调整该物种整体尺寸（会影响同物种全部实例）。目标位置见 [spatial](skills/spatial/SKILL.md)。
- 给一棵树、一株灌木、一丛模板花或整片树林、灌木丛、花地改色，用稳定引用调用 `vegetation.update`，提交 `patch.colorOverride`。`foliageColorRgb` 控制叶片或花瓣，`barkColorRgb` 控制树皮，两者都使用 sRGB 整数 0–255。将某一部位设为 `null` 会恢复它继承的颜色。用 `vegetation.inspect` 的 `properties.colorOverride` 分别读回两个部位的生效颜色及来源。单株读回会计算种植位置上的羽化和叠色，区域引用读回整片区域设置的颜色。
- 绿洲的红树、枯木和沙漠灌木，以及低多边形山谷的橡树、松树，都有独立引用。枯木的可见部位用 `barkColorRgb`。岛上粉彩花和山谷路边白花的每一丛都是 `flower-field`，`distribution` 为 `clump`。按花簇引用可只改这一丛花瓣。
- 给世界坐标内的一小片花、树或灌木改色，用 `vegetation.recolorArea`，指定 `areaId`、圆形或多边形、`targetKinds` 和向内羽化的米数。可用 `assetIds` 限定物种。复用同一 `areaId` 调色或清除。低草草地当前只支持共享配色。
- 修改共享树形时，先用 `vegetation.inspect` 读取 `treeRecipeId`，再通过 `vegetation.update` 的 `treeShape` 修改共享效果槽 1–7。配方树当前仅公开共享配色。
- 整个物种或生态层改色，用 `vegetation.materials.inspect` / `vegetation.materials.apply` 按部位、生态层或 `filter.assetIds` 设置共享材质的线性 RGB。
- 修改区域植被或生态配置：用 `vegetation.config.get` / `vegetation.config.update` / `vegetation.config.reset`（组件包括 `landscape`、`landscapePopulation`、`landscapeInfluence`、`flowers`、`flowerInfluence`、`grassAppearance`、`surfacePalette`、`plantMaterial`）。

## 选择引用

历史记录能确定目标植物时，复用创建或修改结果中的 `assetRef`，也可以复用 `vegetation.query` 结果的 `ref`。需要当前详情时，用这个引用调用 `vegetation.inspect`。身份不明确时，用 `vegetation.query` 查找。

`vegetation.query` 返回资产投影，含 `type`、`ref`，以及可选的 `position`、`bounds`、`tags`、`relations`。详细属性用 `vegetation.inspect` 读取。查询结果不保证有 `name` 字段。

执行要求特定 kind 或 source 的操作前，先检查 `ref.kind` 和 `ref.source`。查询过滤只筛选运行结果，不会缩小声明的联合类型。保留返回的引用，不要构造字段被放宽成 string 的变量，也不要使用类型断言。

修改位置和种子要求是作者植被。原生植被的局部配色同时适用于 natural 和 authored 引用。自然树、灌木和蘑菇支持通过 `vegetation.delete` 移除。

## 检查结果

返回判断请求所需的修改字段。`resolvedEffect` 提供了实际目标位置时，也要返回。用修改结果和最终的 execute 回执判断是否完成。缺少必要证据或证据与请求冲突时，查询同一个 `assetRef`。

对象不在当前画面中，不能证明修改失败。

## 区域植被与生态配置

用 `vegetation.config.get/update/reset` 读写区域植被与生态配置。单株植物的请求不要修改全局物种参数。

`vegetation.query` 返回已发布的原生树和花区，其中 `proceduralAssetId` 和 `planningEntityId` 指向参数所有者。林下实例是流式生成的派生结果，不是单独的作者对象。调整分布时修改所属区域的生态或花参数，局部改色时用 `vegetation.recolorArea`。相机驻留的数量不是保存的种群数量。

## 接口索引

<!-- API_INDEX: generated from executable contracts at load time. -->

<!-- ASSET_TYPES: generated from inspectable asset declarations at load time. -->

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->
