# Water GPU 资源恢复盘点（R-6-01）

盘点基线：926492534；范围为 shared/water 中所有 Texture2D、TextureCube、RenderTarget、ModelMesh、BufferMesh、Buffer 的构造，以及 uploadData、setPixelBuffer、setImageSource。ModelMesh 内部创建的 Buffer 随网格恢复，不重复注册。未发现 Water 直接 new BufferMesh / Buffer。

表中内存指恢复策略额外长期保留的 CPU 数据，不含已有编译资源、GPU 存储、短期解码/打包数组及 JS 闭包开销。资源表以创建函数为单位，不按调用次数计数。

| 位置 | 资源及归属 | 926492534 的恢复能力 | 本批策略 / 额外长期内存 |
| --- | --- | --- | --- |
| runtime/river/RiverMeshUploader.ts | River 河面/汇流网格及内部顶点、索引 Buffer | 已注册 RiverMeshContentRestorer | 沿用；借用编译 geometry，额外数组 0 B |
| runtime/river/RiverLocalMapTextureFactory.ts | River RGBA 局部图集 | 缺 | 借用 atlas.pixels，额外数组 0 B |
| runtime/river/RiverMaterialFactory.ts getRiverTexture | River 内置法线和泡沫纹理，512² RGBA | 缺 | 从模块已有 base64 重新解码并生成 mipmap，额外长期像素 0 B；每张恢复时暂用 1 MiB |
| resources/river/FarmlandsWaterRuntimeResources.ts | River Farmlands 波形/焦散和 8 张 Drop 纹理 | 缺 | 从原 URL 重取 PNG、验证 SHA-256、解码、上传并生成 mipmap；只保留 URL/描述符，长期像素和 ImageBitmap 0 B |
| runtime/river/RiverDropPresentation.ts | River 单一合批 Drop 网格 | 缺 | 从已有 Drop 描述符重新生成几何；额外长期几何数组 0 B |
| runtime/river/RiverDropRenderer.ts | W-05 后只委托 DropPresentation | 旧回退 shader、逐 Drop 网格路径已删除 | 无第二种网格需要恢复 |
| runtime/river/RiverDropParticles.ts | 原生 ParticleRenderer 的 billboard / instance Buffer（由引擎创建） | billboard 有引擎 restorer；instance 数据按引擎 device-loss 契约清空并重新发射 | 不覆盖引擎策略、不保存旧在途粒子；截图双方都从同一初始粒子时刻开始 |
| runtime/connections/WaterConnectionBinding.ts | River/Lake/Ocean 连接岸线 RGBA 图集 | 缺 | 从已有 ports.shoreField 重新编码；长期额外像素 0 B；恢复时暂用 65×65×4 ports×4 = 67,600 B |
| runtime/effects/WaterContactEffects.ts | 通用接触效果的 24 个四边形网格 | 缺 | 从 24 粒子的固定规则重新生成；长期额外几何数组 0 B |
| runtime/effects/WaterContactEffects.ts | 白水接触遮罩，65² RGBA | 缺；仅 dirty 时更新，并非每帧重绘 | 保留最近一次生成的 pixels，不复制；每个启用遮罩 16,900 B；更新时替换旧恢复配方 |
| runtime/heightfield/HeightfieldWaterMeshUploader.ts | Lake/Heightfield 网格及内部 Buffer | 缺 | 借用编译 geometry；额外长期数组 0 B |
| runtime/heightfield/HeightfieldWaterLocalMapTextureFactory.ts | Lake/Heightfield RGBA 图集 | 缺 | 借用 atlas.pixels；额外长期数组 0 B |
| runtime/wave/WaterSurfaceDetailTextureFactory.ts | Lake 程序细节纹理 / Ocean 双斜率纹理 | 缺 | 均从 descriptor 重算像素并生成 mipmap，额外长期像素 0 B |
| runtime/ocean/FiniteOceanSurfaceGeometry.ts | Ocean 近场、远场、中心填充网格及内部 Buffer | 缺 | 保留近场/远场 layout 参数重新生成拓扑，额外长期几何数组 0 B |
| runtime/ocean/OceanNearshoreFieldTextureFactory.ts | Ocean 近岸 RGBA 图集 | 缺 | 借用 atlas.pixels，额外长期数组 0 B |
| runtime/optics/WaterSceneReflectionProbeProvider.ts | 通用静态反射 CubeTexture 和捕获 RenderTarget | 缺；只捕获一次或显式 recapture，并非每帧重绘 | Cube restorer 标记重捕获，DeviceRestored（全部异步恢复完成）后重绘六面和 mipmap；长期像素 0 B。RenderTarget 附件由引擎重建，无内容副本 |
| runtime/ocean/OceanTextureLibrary.ts | Ocean 五张 KTX2 法线/焦散/泡沫/交界噪声纹理 | 已由引擎加载管线覆盖 | ResourceManager.load(AssetType.KTX2) → KTX2Loader 注册 KTX2ContentRestorer；不重复注册 |
| resources/lake/LakeNormalAssetLoader.ts | Lake 外部法线 Texture/KTX2 | 已由引擎加载管线覆盖 | ResourceManager.load → TextureLoader / KTX2Loader 注册对应 restorer；不重复注册 |

## 生命周期与共享边界

`ResourceManager.addContentRestorer` 按 resource.instanceId 覆盖已有配方；`EngineObject._onDestroy` 同时调用 `_deleteContentRestorer`，包括延迟到帧末的销毁。恢复器不拥有第二份 GPU 资源，销毁仍由原 owner/lease 执行。共享程序纹理维持原来的每 Engine 缓存寿命；本批不改变资源所有权或外观。

静态反射探针还需要解除 DeviceRestored 监听；它不能按“每帧重绘 RenderTarget”豁免。场景颜色、深度、SSR 等引擎 Pass 的逐帧目标由引擎分配、重建和重绘，不在 Water 内重复存内容。

MAX_TEXTURE_SIZE 与缺省 DropLook 的外观待 mingming 决定，本批不改。

## 浏览器验收边界

`demos/water/e2e/water-context-recovery.mjs` 在真实 River、Grasslands Lake、Ocean demo 的编译、发布、渲染链上主动调用 WEBGL_lose_context。River 采用带显式 Drop 和障碍物局部图集的固定河道，分别使用 local Look 与 Farmlands Look。

对照固定相机和水面时间（River/Farmlands/Ocean 为 0 秒，Lake 为其自动验收固定的 12.5 秒），固定环境漫反射、关闭环境镜面贡献/雾/后处理，使用纯色背景。原生粒子遵循引擎恢复后清空重发的契约，双方截图均从初始粒子时刻开始。Demo 自己的地形网格由测试夹具恢复；不为任何 shared/water 资源插入测试恢复器，也不重建 Water Body、Backend、纹理或网格对象。这些设置在当前版本和 926492534 负对照中完全一致。

该测试验收 Water 自有资源，不等价于默认 Demo 全部外围效果的上下文恢复验收。调试时发现 shared/lighting 的体积云噪声以及默认场景光照/雾在恢复后存在差异，均未修改生产实现，列为待 mingming 确认的独立范围。

逐像素比较截图解码后的 RGBA8：最大通道差不超过 8/255，平均通道差不超过 0.1/255；固定输入通常应完全一致，少量余量仅用于驱动量化和边缘舍入。负对照必须超过相同阈值；不为负对照取消生产以外的背景恢复。脚本同时检查 drawcall、ModelMesh 数量、控制台错误与 shader 错误，并输出 MD5 与 JSON 报告。
