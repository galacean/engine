# 作物共享图集

14 种现役作物引用 13 张 KTX2。胡萝卜与甜菜的源 PNG 完全相同，运行时使用同一 URL，由 ResourceManager 共享纹理对象。`catalog/plants/*/procedural/atlas.png` 保留为离线美术源，不进入生产资源图；`manifest.json` 记录源文件和产物 SHA256、原始尺寸、物种映射和编码参数。

沿用项目 SeedWorld / Farming 道具纹理管线：KTX-Software 4.4.2、UASTC quality 4、Zstd 18、Lanczos4 完整 mipmap、wrap、top-left、单线程和 `--testrun`。全部图集为 RGBA sRGB，保留叶片 alpha、原始尺寸及 UV；小型水稻色板也保留 16×8。没有改动物种/配方版本或存档语义。KTX2Loader 按设备能力转码，缺少压缩格式时使用引擎现有回退。

```sh
FARMING_KTX2_KTX=/path/to/ktx node world/gallery/shared/farming/tools/encode-plant-textures.mjs
FARMING_KTX2_KTX=/path/to/ktx node world/gallery/shared/farming/tools/encode-plant-textures.mjs --check
```

修改/重新导出源图集后运行生成命令。生成器按内容哈希去重，全部编码及 Khronos 校验成功后发布；检查模式重新编码并逐字节比较，不改写产物。生产构建边界拒绝导入离线作物 PNG。

纹理请求是植物创建队列的 `texture` 阶段：首次可见帧准入前不发起请求，不解码或分配图集。已经准入的请求及缓存归 ResourceManager，取消一个实例不取消其他实例的共享请求。独立工厂调用沿用其明确的立即创建语义；Planner 只提供相机/可见性与宿主，不另建纹理策略。

真实 WebGL 回归：`shared/farming/tests/browser/p1-regressions/`，覆盖画外零请求、取消后零请求、重新入镜创建、13 个共享纹理对象、色彩空间/mip、程序化植株帧内回收、满篮实际 Draw Call 及反复收起回收。纹理格式和内存结果仅代表运行设备，不能作为手机 FPS、功耗或温升验收。
