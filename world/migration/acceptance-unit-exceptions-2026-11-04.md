# 单测未通过与未完成明细

> 2026-11-04 验收口径已更正：严格保留 engine-next 原有逻辑，只恢复迁移差异。此前额外行为修复及调整夹具所得通过数已撤回，以下历史数据不代表当前最终版本；以 [源码对齐续验记录](source-parity-2026-11-04.md) 为准。

本表记录本次验收的真实未通过项，不把原项目同样失败改写为通过。文件名沿用来源测试名；目标测试通过迁移映射消费实际新实现。原始日志位于忽略目录 `world/.acceptance`。

## 断言失败（按文件汇总）

| 测试文件 | 失败条数 | 原项目同样失败 | 仅目标失败 |
| --- | ---: | ---: | ---: |
| `demos/volumetric-clouds/tests/VolumetricCloudContract.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/AreaPopulation.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/AssetEntranceEffect.spec.ts` | 7 | 7 | 0 |
| `demos/terrain/project-tests/CanyonGrounding.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/ConnectedCurveWorld.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/ContextLandscapeClusters.spec.ts` | 7 | 7 | 0 |
| `demos/terrain/project-tests/Director.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/DirectorGroups.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/DirectorNavigation.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/DirectorParameterTrial.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/GuidanceCollision.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/GuidanceFitting.spec.ts` | 5 | 5 | 0 |
| `demos/terrain/project-tests/InternalRoadMode.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/LandscapeInfluences.spec.ts` | 4 | 4 | 0 |
| `demos/terrain/project-tests/LayoutRoadMigration.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/LocalSpacingFallback.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/OffshoreConfiguration.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/P3WindMergeGate.spec.ts` | 2 | 0 | 2 |
| `demos/terrain/project-tests/PlanningBasemapPerformance.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningBuildingCompatibility.spec.ts` | 4 | 4 | 0 |
| `demos/terrain/project-tests/PlanningBuildingSizing.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/PlanningComponentBases.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningControlsCompatibility.spec.ts` | 1 | 0 | 1 |
| `demos/terrain/project-tests/PlanningEcologySampling.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningExperienceControls.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningFarmRiverParity.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningFarming.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningGrassTerrainBinding.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/PlanningInspectorContent.spec.ts` | 7 | 7 | 0 |
| `demos/terrain/project-tests/PlanningInvalidation.spec.ts` | 4 | 4 | 0 |
| `demos/terrain/project-tests/PlanningParameterRepairs.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/PlanningParameterUnits.spec.ts` | 5 | 5 | 0 |
| `demos/terrain/project-tests/PlanningPerformance.spec.ts` | 7 | 7 | 0 |
| `demos/terrain/project-tests/PlanningPoiArt.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningPoiPlacement.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningPresentationRoads.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/PlanningRaster.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningRegeneration.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/PlanningResources.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/PlanningRiverAuthoring.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningSeedRuntimeDebug.spec.ts` | 10 | 10 | 0 |
| `demos/terrain/project-tests/PlanningSeedWorldSession.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/PlanningSpatialCache.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/PlanningStorage.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningTerrainPresentation.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningVisualPresentation.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PlanningWorldSourceLifecycle.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PoiComposition.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/PoiLandformPlacementIdentity.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/PoiNetwork.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/PoiParameterScopes.spec.ts` | 4 | 4 | 0 |
| `demos/terrain/project-tests/PoiPopulation.spec.ts` | 4 | 4 | 0 |
| `demos/terrain/project-tests/PoiRegionElevation.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/PoiSelectionDiagnostics.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/PoiSemanticControls.spec.ts` | 6 | 6 | 0 |
| `demos/terrain/project-tests/PoiSpacingMigration.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/PoiTraversal.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/PromptNoiseWaterStageC2Baseline.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/RoadOrganizationMatrix.spec.ts` | 10 | 10 | 0 |
| `demos/terrain/project-tests/RoadVisualRegression.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/SceneVisualIntentTransport.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/SeedWorldLakeFlora.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/SeedWorldParticleWarmup.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/SeedWorldRockAssemblyMaterial.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/SeedWorldRockPickRouting.spec.ts` | 9 | 9 | 0 |
| `demos/terrain/project-tests/SeedWorldRuntimeConsumption.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/SeedWorldShaderWarmup.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/SeedWorldTaskPresentation.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/SeedWorldTerrainRuntimeIntegration.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/SeedWorldTextureCompression.spec.ts` | 1 | 0 | 1 |
| `demos/terrain/project-tests/SeedWorldVoiceHudController.spec.ts` | 5 | 5 | 0 |
| `demos/terrain/project-tests/SeedWorldVoiceHudShaders.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/SeedWorldWaterShaderAot.spec.ts` | 3 | 0 | 3 |
| `demos/terrain/project-tests/SettlementProfile.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/SpatialDefaultEntry.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/SpatialFieldValue.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/SpatialFramework.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/SpatialLayoutSession.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/SpatialOrganization.spec.ts` | 5 | 5 | 0 |
| `demos/terrain/project-tests/SpatialReveal.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/SpatialRivers.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/SpatialRoadContinuity.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/SpatialSelectionScope.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/SpatialSupportTopology.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/TerrainAssetPipeline.spec.ts` | 2 | 1 | 1 |
| `demos/terrain/project-tests/TerrainDayNightWaterReflection.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/TerrainEnvironmentArchitecture.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/TerrainProjectDataClosure.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/TerrainScreenSpaceReflectionPanel.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/TerrainShaderDebugResources.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/TerrainShaderResources.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/TerrainWaterSsrIntegration.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/TreeSpeciesRecipes.spec.ts` | 1 | 0 | 1 |
| `demos/terrain/project-tests/VisualGuidance.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WayfindingIncremental.spec.ts` | 4 | 4 | 0 |
| `demos/terrain/project-tests/WayfindingPolicy.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/WayfindingProfile.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WayfindingStudy.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldAnchoredEdits.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/WorldCanyonStructure.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldContourDetail.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldIncrementalEditing.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/WorldLayoutPlanner.spec.ts` | 4 | 4 | 0 |
| `demos/terrain/project-tests/WorldLayoutRoutes.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldMountainChain.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/WorldMountainFootprint.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldObservationStructure.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/WorldOpenSpaces.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldPlanningControls.spec.ts` | 3 | 3 | 0 |
| `demos/terrain/project-tests/WorldPlanningCoverage.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/WorldPlanningLocalControls.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldPlanningRoadDetail.spec.ts` | 4 | 4 | 0 |
| `demos/terrain/project-tests/WorldPlanningRoadWidth.spec.ts` | 15 | 15 | 0 |
| `demos/terrain/project-tests/WorldPlanningValley.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/WorldRegionArea.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldRiverMouth.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldRiverWidthVariation.spec.ts` | 2 | 2 | 0 |
| `demos/terrain/project-tests/WorldSeedScope.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldSemanticPlanner.spec.ts` | 6 | 6 | 0 |
| `demos/terrain/project-tests/WorldSettlementPlanner.spec.ts` | 14 | 14 | 0 |
| `demos/terrain/project-tests/WorldSpatialAssembly.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldVillageComplexLayouts.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/WorldWaterDiversity.spec.ts` | 1 | 1 | 0 |
| `demos/terrain/project-tests/editor/seed-world-edit.spec.ts` | 1 | 1 | 0 |

## 仅目标失败的 9 条旧入口/工具契约

| 用例 | 缺少的旧边界 |
| --- | --- |
| `P3WindMergeGate.spec.ts` — P3 wind merge gate keeps reproducible mechanical-asset generation in the tracked build surface | TypeError: Cannot read properties of undefined (reading 'terrain:wind-attachments:generate') |
| `P3WindMergeGate.spec.ts` — P3 wind merge gate retains browser performance and physical iOS/Android acceptance entry points | TypeError: Cannot read properties of undefined (reading 'test:terrain-wind-performance:e2e') |
| `PlanningControlsCompatibility.spec.ts` — planning controls against Engine 2.0 keeps runtime import seed-world-planner/v2/V2WorldView.ts on the compatible control module | Error: ENOENT: no such file or directory, open 'demos/terrain/seed-world-planner/v2/V2WorldView.ts' |
| `SeedWorldTextureCompression.spec.ts` — Seed World runtime texture compression pins deterministic UASTC quality and supercompression settings in the generator | Error: ENOENT: no such file or directory, open 'demos/terrain/scripts/encode-seed-world-runtime-textures.mjs' |
| `SeedWorldWaterShaderAot.spec.ts` — Seed World Water finite AOT profiles replaces existing AOT project declarations without duplicates (has IDs: false) | Error: Cannot find module 'demos/terrain/scripts/generate-seed-world-water-shader-aot.mjs' imported from 'demos/terrain/project-tests/SeedWorldWaterShaderAot.spec.ts' |
| `SeedWorldWaterShaderAot.spec.ts` — Seed World Water finite AOT profiles replaces existing AOT project declarations without duplicates (has IDs: true) | Error: Cannot find module 'demos/terrain/scripts/generate-seed-world-water-shader-aot.mjs' imported from 'demos/terrain/project-tests/SeedWorldWaterShaderAot.spec.ts' |
| `SeedWorldWaterShaderAot.spec.ts` — Seed World Water finite AOT profiles fails closed for non-canonical profile identities and paths | Error: Cannot find module 'demos/terrain/scripts/generate-seed-world-water-shader-aot.mjs' imported from 'demos/terrain/project-tests/SeedWorldWaterShaderAot.spec.ts' |
| `TerrainAssetPipeline.spec.ts` — Terrain asset pipeline loads every demo through one release manifest and selected Scene | Error: ENOENT: no such file or directory, open 'demos/terrain/generator/main.ts' |
| `TreeSpeciesRecipes.spec.ts` — Tree species exposed-parameter tree recipes loads final tree structures only through species-specific runtime chunks | Error: ENOENT: no such file or directory, open 'demos/terrain/asset-assembly/offline/generate-tree-species-structure.mjs' |

## 未成功执行的文件

| 文件 | 状态 / 原因 |
| --- | --- |
| `demos/water/tests/demo/WaterGalleryNavigation.test.ts` | 加载失败：Cannot find module '../../../../shared/GalleryRoute' imported from 'demos/water/tests/demo/WaterGalleryNavigation.test.ts' |
| `demos/terrain/project-tests/PlanningWaterEditing.spec.ts` | 加载失败：definition.id is not iterable |
| `demos/terrain/project-tests/SeedWorldAgentApplication.spec.ts` | 加载失败：Cannot find module '../seed-world-planner/agent-adapter/tools/mount-tools' imported from 'demos/terrain/project-tests/SeedWorldAgentApplication.spec.ts' |
| `demos/terrain/project-tests/SeedWorldV2References.spec.ts` | 加载失败：Cannot find module '../seed-world-planner/v2/V2ReferenceScenes' imported from 'demos/terrain/project-tests/SeedWorldV2References.spec.ts' |
| `demos/terrain/project-tests/SeedWorldV2RegionalRelief.spec.ts` | 加载失败：Cannot find module '../seed-world-planner/v2/V2ReferenceScenes' imported from 'demos/terrain/project-tests/SeedWorldV2RegionalRelief.spec.ts' |
| `demos/terrain/project-tests/SeedWorldV2RidgeCrossing.spec.ts` | 加载失败：Cannot find module '../seed-world-planner/v2/V2ReferenceScenes' imported from 'demos/terrain/project-tests/SeedWorldV2RidgeCrossing.spec.ts' |
| `demos/terrain/project-tests/SeedWorldV2Session.spec.ts` | 加载失败：Cannot find module '../seed-world-planner/v2/V2Session' imported from 'demos/terrain/project-tests/SeedWorldV2Session.spec.ts' |
| `demos/terrain/project-tests/SeedWorldV2Wading.spec.ts` | 加载失败：Cannot find module '../seed-world-planner/v2/V2NavigationSurface' imported from 'demos/terrain/project-tests/SeedWorldV2Wading.spec.ts' |
| `demos/terrain/project-tests/SeedWorldV2WaterValley.spec.ts` | 加载失败：Cannot find module '../seed-world-planner/v2/V2ReferenceScenes' imported from 'demos/terrain/project-tests/SeedWorldV2WaterValley.spec.ts' |
| `demos/terrain/project-tests/TerrainProjectArtifactWriter.spec.ts` | 加载失败：Cannot find module '../tools/project-artifact/TerrainProjectArtifactWriter' imported from 'demos/terrain/project-tests/TerrainProjectArtifactWriter.spec.ts' |
| `demos/terrain/project-tests/TerrainScriptRegistryCompiler.spec.ts` | 加载失败：Cannot find module '../tools/project-artifact/TerrainScriptRegistryCompiler' imported from 'demos/terrain/project-tests/TerrainScriptRegistryCompiler.spec.ts' |
| `demos/terrain/project-tests/WorldGeneration.spec.ts` | 加载失败：Cannot find module '../generator/src/WorldCommandTriggers' imported from 'demos/terrain/project-tests/WorldGeneration.spec.ts' |
| `demos/terrain/project-tests/WorldPlanningTerrainPerformance.spec.ts` | 前置失败：详见原始测试日志 |
| `demos/terrain/project-tests/WorldPlanningVillageArea.spec.ts` | 前置失败：详见原始测试日志 |
| `PlanningWaterEdits.spec.ts` | 原项目与目标均内存耗尽，未完成；不是通过 |

两处 WorldPlanning 前置失败及 PlanningWaterEditing 加载错误在原项目也可复现。其余缺少的旧工具、V2 和 Gallery 基础设施不在已确认迁移范围。Tiny Glade / Masonry Node 的失败、跳过及外部 fixture 依赖另见主报告。
