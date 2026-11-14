# Hoe / Rake 动画道具

来自用户已有的 Farmlands `FarmTools` 模型，使用项目原有授权。源项目：`Farmlands-Library.blend`，Blender 5.2.1 LTS。

| 道具 | Blender 场景 | 动作 | 时长 | LOD0 三角形 |
| --- | --- | --- | --- | --- |
| Hoe | `21 - Hoe Tilling Preview` | `Hoe_Till` | 3.6 秒 | 620 |
| Rake | `22 - Rake Seedbed Preview` | `Rake_Level` | 4 秒 | 1,664 |

动画已由用户确认。Hoe 采用抬锄、落锄入土、向身前拉松、抬起复位；Rake 采用前伸、齿尖浅接触表土、长距离回拉、抬起复位。每个动作含两次作业。动作参考见 [锄具操作](https://www.easydigging.com/gardening/garden-hoes/buy-grub-hoe.html) 和 [RHS 整地说明](https://www.rhs.org.uk/education-learning/school-gardening/resources/getting-started/get-the-soil-ready-for-planting)。

根节点位于目标土地中心。保留原始米制尺寸，去除目录展示变换；Blender +Y（背离操作者）转换为 glTF -Z，默认根节点无需叠加转向。`Root → Motion → Contact + Tool_LOD0`，只有 Motion 与 Contact 的动画随模型导出。地面、握持参考点、灯光、相机、字幕均不导出。贴图使用外部共享的 1024 像素 KTX2，Tools B 在锄头和耙子间共享，见 [共享纹理](../prop-textures/README.md)。

GLB 作为 Prefab 的依赖，通过 farming 虚拟资源路径注册；宿主加载 `.prefab` 并实例化。控制器引用 GLB 的 `animations[0]`。重新导出后如果节点层级变化，需要同步 Prefab 的材质/阴影覆盖路径。每个模型只有一个合并动作，时间从 0 开始。

```sh
blender --background /Users/xingyi/Documents/data/unity/farmlands-crops/blender/Farmlands-Library.blend --python-exit-code 1 --python world/gallery/shared/farming/tools/export-tilling.py
```

导出脚本不保存 `.blend`，不修改源项目中的动作。生产边界仅允许显式登记的道具模型，仍禁止植物 GLB。

Blender 导出后，执行 `node world/gallery/shared/farming/tools/encode-prop-textures.mjs` 完成纹理去重、压缩和 GLB 外部引用转换。

Gallery → 程序化种植系统 → 种植动画预览，支持第一人称/侧面/自由视角、暂停、拖动进度、速度与循环。该页面与动画播放器仅处理表现，不创建耕地或修改种植状态。
