# 工具与容器共享纹理

七个 Farming 道具 GLB 的 25 处纹理引用复用本目录的 16 张 KTX2。推车和仓储篮子共享木材贴图，手持篮子和水壶共享篮子/水壶贴图，锄头和耙子共享 Tools B。种子袋使用袋身 C/N/ORM 和标签图集 C 四张独立纹理。源 PNG 按内容 SHA256 与色彩空间去重，仅供离线再生成，不进入运行时资源注册。

编码沿用 `demos/terrain/scripts/encode-seed-world-runtime-textures.mjs`：KTX-Software **4.4.2**、UASTC quality **4**、Zstd **18**、Lanczos4 完整 mipmap、wrap、top-left、单线程与 `--testrun`。保留原 1024×1024 分辨率；`*_C` 使用 sRGB，法线和 ORM/ORMH 使用 linear。线性图保留 RGB，未被 glTF 材质消费的高度 alpha 不进入运行纹理。

模型通过 `KHR_texture_basisu` 必需扩展引用 `../prop-textures/*.ktx2`。`FarmingPropResources.ts` 用加载器相同的 `Utils.resolveAbsoluteUrl` 计算规范虚拟路径并注册到 Vite 构建 URL（当前引擎会将相对虚拟路径的首段规范为小写 `farming`）；引擎的 KTX2Loader 根据设备能力选择压缩格式，并由 ResourceManager 按统一 URL 共享加载中的请求及纹理实例。无可用压缩格式时沿用引擎的解码回退。

`manifest.json` 保存源 PNG 与 KTX2 哈希、编码参数，以及去掉纹理存储差异后的模型内容哈希。生成器压缩前后核对全部 accessor 数据、UV、节点、材质、动画、Morph 与场景结构；图片 bufferView 从 GLB 二进制中真正移除，不保留重复的 PNG 或回退图片。

在仓库根目录执行：

```sh
FARMING_KTX2_KTX=/path/to/ktx node world/gallery/shared/farming/tools/encode-prop-textures.mjs
FARMING_KTX2_KTX=/path/to/ktx node world/gallery/shared/farming/tools/encode-prop-textures.mjs --check
```

工具来自 [Khronos KTX-Software v4.4.2](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2)。若 `ktx` 已在 PATH，可省略环境变量。检查模式重新编码并逐字节比较跟踪资源，不改写它们。

Blender 道具导出器仍输出内嵌 PNG 的原始 GLB；每次重新导出后执行以上生成命令。生成器提取同源 PNG、去重编码并重排非图片二进制块，已有外部纹理使用跟踪的源 PNG 再生成。之后运行 Farming 资源测试及构建，防止重新导出绕过共享压缩链路。

实际浏览器检查入口：`shared/farming/tests/browser/prop-textures/`。页面加载并绘制七个道具，输出纹理格式、色彩空间、mipmap、实例 ID，以及 25 处引用是否只产生 16 张共享纹理。
