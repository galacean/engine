# Ocean · 环岛海洋

Gallery 的 **Water → Ocean · 海洋** 独立案例。直接入口为 `demos/water/ocean/index.html`，Gallery 路由为 `#water/ocean`。

场景中央是一座有沙滩、草坡和岩质山顶的岛屿，周围依次是浅水陆架、深海和远海地平线。提供环岛全景、近岸浅水、远海地平线三个观察视角，以及海浪暂停／继续控制。与湖泊、河流共用桌面相机操作：点击画面后 WASD 移动、Q/E 升降、拖动查看方向；调参输入框获得焦点时停止移动。

开发模式下右侧提供 SeedWorld 同款 Water DevTools，默认折叠，入口加 `?debug=1` 可展开。可调海平面、波浪、法线、深浅水颜色、反射、折射、泡沫、焦散与透光参数，也支持重置和复制调参 JSON。海平面复用 SeedWorld 的运行时偏移控制，范围为基准上下 10 米；左侧暂停按钮与 DevTools 的场景时间／固定时间共用同一状态。调参仅作用于当前页面，生产构建与 SeedWorld 一样不包含 DevTools。

## 复用边界

- `IslandOceanSource.ts` 仅拥有案例地形与海底数据。可见地形和 Ocean 近岸编译输入读取同一份高度网格；连续岸线的距离场用于贴岸泡沫。
- `createIslandOceanBody` 使用 SeedWorld 同样的 `createWaterBodyAsset`、`createWaterBodyInstance`、`world-space-ocean / gerstner` 表示和 `registerOceanAuthoring`。Body 的位置与地形来源属于案例，Look 与渲染参数属于 Water。
- 原样复用 `OCEAN_LOOK`、`OceanTextureLibrary`、`OceanWaterBackend`、`WaterSceneRuntimeHost`，以及近岸编译器、摄像机颜色／深度资源、环境反射和相机跟随的远海网格。没有案例专属 Water Shader 或材质参数副本。
- 天空、体积云、实时 IBL、日间照明和后处理复用 SeedWorld 使用的 Integrated World 环境实现，固定为共享的正午参考时间。Ocean 与当前 SeedWorld 一样关闭场景雾。
- Ocean Backend 提供现有 Surface / SpatialField 查询端口；实例的 `interaction.query` 决定是否注册到 WaterWorld。环境反射、折射、波浪、泡沫、焦散保持，SSR、浮力、尾迹不启用。

## 共享表面与光学

`OceanRenderContract` 从已发布的 canonical Ocean Look 编译契约，`OceanSurfaceShaderAssembly` 将 Gerstner／近岸输入与远海投影输入分别接入 `WaterSurfaceGeometryAdapter`。近景与远景都通过共享 BRDF、RawContribution、FinalClosure 和最终输出；深度响应、方向高光、边界响应由共享 Appearance 生成与绑定。运行时使用 Body 传入的真实契约，自定义光学参数会同步到调参快照，避免后续修改波浪时回落到默认光学值。

Ocean 保留波浪、法线纹理、近岸场、纹理泡沫、焦散采样，以及无场景纹理的远海降级策略。焦散与受限风格化透光以附加透射辐射进入共享合成，再受到 Fresnel 和泡沫遮蔽；粗糙透射策略用共享 DFG 反射权重补偿远海掠射角的能量。这两个可选策略按需生成，Lake/River 默认不包含其 Shader 代码。


此次验收和成本边界见 [OceanSharedSurfaceAcceptance.md](./OceanSharedSurfaceAcceptance.md)。
模块冗余、命名收敛和待处理问题见 [OceanModuleReview.md](./OceanModuleReview.md)。

## 开发与验证

在 `world/` 执行 `pnpm gallery:sync`，然后 `pnpm dev`。首次运行需按 `world/README.md` 先准备、安装及构建物化 Engine。

```sh
pnpm typecheck:water
node scripts/run-engine.mjs pnpm --dir world-gallery exec vitest run demos/water/tests/demo/IslandOceanSource.test.ts --config vitest.config.ts
```

通过左侧按钮切换环岛全景、近岸浅水和远海地平线，并暂停／恢复海浪；开发模式下通过 Water DevTools 调整水体外观。

验收应实际进入 Gallery 菜单并切换三个视角，检查岸线、浅海折射／焦散、远海连续性、暂停／恢复、浏览器控制台和失败请求；桌面结果不代表移动真机验收。

## 已发布 Ocean 查询

`OceanWaterSurfaceProvider` 与控制器共享已发布的近岸编译资源。查询边界是有限源 envelope，不随相机跟随网格、frustum 或 UI 显隐改变。近岸湿侧取已编译 SDF 的零等值线（50% coverage），不包含屏幕抗锯齿边缘；低于海平面的陆地凹坑仍由 Ocean mask 排除。最终床面节点双线性采样，水深为 `max(0, effectiveWaterLevel - bedHeight)`，不读取 Shader RGBA8 的量化深度。

Ocean 返回已发布水位加运行时水位偏移，上法线、零速度；没有 CPU Gerstner 波浪模拟，deformation / surfaceVelocity 能力为 false。River 继续使用原有动态 SurfaceProvider。近岸场之外按现有 DeepOcean / Dry 边策略查询，多边交叉时 Dry 优先；DeepOcean 水深采用已有 Shader 深水代理，SpatialField 不标记 Bathymetry 有效，bedHeight 为 NaN，不能当成已测海床。超出有限源范围不命中。

实例发布、替换、失败、取消、移除与销毁复用 Loader / Host / WaterWorld 的路由生命周期。隐藏水体只影响显示，不撤销查询；显式关闭 interaction.query 才撤销其路由。新增回归见 OceanWaterSurfaceProvider 与 OceanWaterBackend 测试。
