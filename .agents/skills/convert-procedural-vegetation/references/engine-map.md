# Engine 代码入口与入库

以目标分支的实现和项目清单为准。植被源码位于 [packages/vegetation/src/asset-assembly](../../../../packages/vegetation/src/asset-assembly)，展场位于 [world/demos/vegetation](../../../../world/demos/vegetation)。

## 离线还原与编译

- [树木还原 Demo](../../../../world/demos/tree-reconstruction/index.html) 使用 [tree-reconstruction-service.cjs](../../../../packages/vegetation/src/asset-assembly/offline/tree-reconstruction-service.cjs) 接收源树 FBX、调用参数还原工具并评估结果。查看 `comparisonStages`、无材质三视图、`lodAcceptance`，按实际报告处理能力缺口。该 Demo 的三角面预算由服务和配方声明。
- [fit-procedural-plant.py](../../../../packages/vegetation/src/asset-assembly/offline/fit-procedural-plant.py) 支持 FBX 中按名称标出的 LOD 和单木质支撑。查看它的入参和源模型限制。GLB 或其他拓扑从原始节点、材质和 LOD 提取对应部件，再拟合到既有结构格式。
- [compile-procedural-plant.mjs](../../../../packages/vegetation/src/asset-assembly/offline/compile-procedural-plant.mjs) 接收解码后的结构 JSON，直接调用通用运行时几何编译器，经 stdout 返回各级网格用于离线核对。树骨架配方走 [TreeSpeciesGeometry.ts](../../../../packages/vegetation/src/asset-assembly/TreeSpeciesGeometry.ts) 和 [ProceduralTreeGenerator.ts](../../../../packages/vegetation/src/asset-assembly/ProceduralTreeGenerator.ts)。生成网格用于测量和预览，发布时保留最终结构和其资源引用。
- [PlantParameterEncoding.ts](../../../../packages/vegetation/src/asset-assembly/PlantParameterEncoding.ts) 定义版本化共享表和无损数值编码。复用现有入口先解码再校验和编译。形态、材质和项目资源的职责见 [Asset Assembly 文档](../../../../packages/vegetation/src/asset-assembly/README.md#最终结构参数与离线边界)。

## 物种与生产项目

1. 在 [plant-species.json](../../../../packages/vegetation/src/asset-assembly/generated/procedural-trees/plant-species.json) 中按格式登记 `assets`、`treeRecipes` 或 `shrubRecipes`。`prototypes` 供实例引用。绑定结构、材质和植被层，核对 `vegetation.seedWorld` 的明确排除与目标一致。`geometryAccepted` 独立于物种筛选。用 [sync-plant-species.mjs](../../../../packages/vegetation/src/asset-assembly/offline/sync-plant-species.mjs) 从实际 LOD0 编译刷新乔木尺寸，可用 `--check` 检查。
2. 通用植被外观从 [meadow-plant-materials.json](../../../../packages/vegetation/src/asset-assembly/generated/procedural-trees/meadow-plant-materials.json) 解析，资源复用由 [ProceduralPlantLibraryRuntime.ts](../../../../packages/vegetation/src/asset-assembly/ProceduralPlantLibraryRuntime.ts) 和 [ProceduralPlantMaterialBindings.ts](../../../../packages/vegetation/src/asset-assembly/ProceduralPlantMaterialBindings.ts) 执行。兼容实例的颜色通过 `renderer_AssetAssemblyColor` 传入。观察真实 draw 使用 [PlantDrawCallProfiler.ts](../../../../packages/vegetation/src/asset-assembly/PlantDrawCallProfiler.ts)。
3. Seed World 的项目内资源使用 [PlantSpeciesResources.ts](../../../../packages/vegetation/src/asset-assembly/PlantSpeciesResources.ts) 定义的 `World/Vegetation/`。沿 [SeedWorldProject.ts](../../../../world/demos/seed-world/SeedWorldProject.ts) 和 [project.json](../../../../packages/terrain/src/data/seed-world/project.json) 追踪生产目录、资源文件和场景引用。改项目投影时，用 [PlantProjectFormats.ts](../../../../packages/world-planning/src/integrations/vegetation/PlantProjectFormats.ts) 核对结构、外观与生产目录的类型及引用。检查新项目和任务涉及的已有项目；修改项目资产时，通过原有项目编辑与持久化入口保存。

如需交付可拖入 Editor 的普通资源，按目标工程支持的格式，用同一最终结构编译每级 Mesh，绑定共享材质后通过其现有资源导入方式交付 Prefab，并在目标项目中验证。另有发布到 CDN 召回库的任务时，使用仓库的 [资产入库 Skill](../../import-galacean-assets/SKILL.md)。

## 检查入口

按改动范围选用现有检查。修改物种和结构引用时检查植被资源闭包；修改生产项目资产时验证项目清单、类型和引用。运行前按仓库要求准备依赖和引擎构建产物。

```sh
node --test packages/vegetation/tests/PlantRuntimeResources.test.mjs
pnpm exec vitest run --config world/tests/seed-world/vitest.config.mjs PlantProjectAssets.spec.ts
```

通过 `pnpm --dir world dev` 服务当前工作树，打开 `/world/demos/vegetation/index.html`，等待 `window.assetAssembly.ready`，用 Meadow 核对实际渲染。`?view=procedural-plants` 用于单体参数形状检查。Seed World 交付打开 `/world/demos/seed-world/index.html?seed=1&debug=1&view=3d` 或任务指定的工程、Seed 和模板，以实际场景中的资产为准。
