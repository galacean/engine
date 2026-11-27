# Farmlands 仓储道具

静态推车 `SM_Farm_Carriage_01` 与篮子 `SM_Farm_FoodContainer_01` 来自项目已有 Polyart Studio / Farmlands 素材。篮子使用原 LOD0；推车基于 LOD0 在 Blender 离线减面，运行时只有一个版本。仅作为承载容器；产物几何不来自 GLB。

- 推车按源尺寸 60% 导出，外包围约 1.4293 × 2.2813 × 1.1785m（宽 × 深 × 高）。
- 篮子原尺寸导出，约 0.5668 × 0.5668 × 0.3351m。
- FBX 世界变换烘焙进顶点，水平居中、底部对齐地面；GLB 为 Y-up、米制、无动画。
- 同源 `T_Farm_OutdoorsWoodKitbash_C/N/ORMH.tga` 转为共享的 1024 像素 KTX2，推车和篮子复用同一组纹理。保留原 UV，ORMH 绿通道为粗糙度、蓝通道为金属度（×0.65）；压缩与再生成见 [共享纹理](../prop-textures/README.md)。
- 原 FBX 的路径、SHA256、尺寸和底面测量记录在 `source-measurements.json`，不修改源 Unity/FBX/Blender 工程。

再生成：`blender -b --factory-startup --python-exit-code 1 --python world/gallery/shared/farming/tools/export-storage.py -- --source <Farmlands目录>`。

Blender 导出后，执行 `node world/gallery/shared/farming/tools/encode-prop-textures.mjs` 完成纹理去重、压缩和 GLB 外部引用转换。

2026-10-28 推车减面：Blender 5.2.1，先合并 1e-6 米以内重合顶点，再以 0.22 比率 Collapse；恢复 35° 锐边和面积加权法线，避免木板被平滑成圆面。限制简化后的顶点不超出原模型边界，保留地面原点及原放置足迹。24,052 → 5,289 个三角形（减少 78.0%），最终 GLB 约 337 KiB，不含共享 KTX2。原 FBX 不修改，`--cart-ratio 1` 可重新导出原始版本。`source-measurements.json` 记录原始来源与本次减面参数。

推车模型不投射、不接收阴影。SeedWorld 与第一人称农场提供相机位置，复用作物距离策略：超过 60 米隐藏，在 50 米以内恢复，包含车内货物；保留缓存与库存，不切换 LOD。没有相机位置的原生宿主保持原有可见行为，仓储篮子不受本次策略影响。

Blender 同光照前后两组对照渲染已检查；这不代替游戏内审美与 GPU 验收。纹理内容、材质和虚拟引用保持原样，本轮仅替换已压缩运行 GLB 的几何数据，并同步其 `contentSha256`。

素材沿用原项目授权；本次导出不改变素材使用许可。Prefab 通过 `Farming/Props/Storage/` 虚拟路径引用资源。
