# 种子袋模型（Wheat Sack）

## 来源与授权

- 模型：[Wheat Sack](https://sketchfab.com/3d-models/wheat-sack-05da6afe598b4f8cb1eb3168bbe5839a)
- 作者：Seth Santos（[@Seth7Santos](https://sketchfab.com/Seth7Santos)）
- 授权：[CC BY 4.0](http://creativecommons.org/licenses/by/4.0/)，允许商用，须署名。
- 改动：Blender 减面（1,956 → 820 三角形）；去掉原袋面 “WHEAT” 麦穗印花；新增 132 三角形的袋面标签网格，使用 14 种作物的标签图集；贴图由 2048 缩至 1024 并转 KTX2。

“Wheat Sack” by Seth Santos, licensed under CC BY 4.0, modified for Galacean engine-next farming.

## 文件

- `seed-sack.glb`：`SeedSack`（袋身，820 三角形，材质 `SeedSack`：C / N / ORM）与子节点 `SeedSackLabel`（132 三角形，材质 `SeedSackLabel`，alpha 混合）。合计 952 三角形。单位米，袋子平放，原始尺寸约 1.06 × 0.62 × 0.20 m，原点在底面中心。
- `seed-sack-labels.json`：标签图集 4×4，每格 256 像素、4 像素透明边，按作物 `*-seed` 记录行列。标签网格 UV 覆盖一整格，运行时按种子设置 tilingOffset 选格。
- 纹理在 `../prop-textures/`：`T_SeedSack_C`、`T_SeedSack_N`、`T_SeedSack_ORM`、`T_SeedSack_Labels_C`，均 1024×1024。

## 再生成

原始下载与生成脚本留在工作记录目录（不进仓库）：`work-logs/work/farming/2026-10-21-seedbag-wheat/`

1. `textures/make_textures.py`：去印花、缩图、绘制标签图集（图标取自 `content/icons/*.png`）。
2. `blender/build_seed_sack.py`：减面（Collapse 0.42）、生成标签网格、导出 GLB。
3. 仓库根目录执行 `node world/gallery/shared/farming/tools/encode-prop-textures.mjs`，转 KTX2 并改为外部引用。
