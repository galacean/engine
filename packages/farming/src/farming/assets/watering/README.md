# 浇水道具与粒子资源

运行时通过 Galacean 标准 `AssetType.Prefab` 加载 `watering-can.prefab`。它以 GLB 实例保留完整层级、材质和 Morph，引用 `watering.animCtrl` 配置 `Watering` 单次动作，并声明 Animator 手动更新及渲染阴影配置。`presentation/props/FarmingPropResources.ts` 注册 farming 自有的虚拟资源路径和真实构建 URL，Prefab 与控制器中的引用不依赖文件哈希、页面路径或 Terrain/Seed 的静态资产库。

增加其他道具时，在 farming 道具资源声明中登记模型、Prefab 和需要的控制器，使用各自命名空间；宿主通过 Prefab 实例化道具。新增 GLB 还需在 `tools/production-boundary.cjs` 显式登记生产允许的道具，不能绕过植物模型禁入检查。重新导出若改变了节点顺序、层级或动画索引，须同步 Prefab 覆盖路径及控制器引用，资源依赖测试会核对绑定。控制器和模型由 ResourceManager 管理，表现组件只销毁实例及自己创建的粒子资源。当前只登记水壶，不引入尚未使用的通用资产框架。

- `watering-can.glb`：从现有 `Farmlands-Library.blend` 的 `20 - Watering Preview` 场景导出，包含 `WateringRoot → WateringMotion → WateringCan_LOD0 / WateringNozzle / WateringWater` 五个节点。壶体为 1,322 三角形，内部水面为 48 三角形；`Watering` 动作 2 秒，同时包含壶体变换与水面形态权重；三张 1024 像素 KTX2（原 Farmlands C / N / ORM）与手持篮子共享，见 [共享纹理](../prop-textures/README.md)。单位为米，Y-up，导出后的壶嘴本地 **+Y** 为出水方向。
- 内部水面使用独立的不透明青灰色 PBR 材质，不增加贴图或透明折射。7 个形态目标描述壶内截面，权重按现有倾倒动作逐帧烘焙，让水面近似水平且收在内壁以内；动作首尾回到相同水位，支持重复浇水。这是美术表现，不模拟水量消耗。
- 第一人称采用右手构图：从画面右侧抬壶、向左前方约 30° 倾倒、回到右侧收壶。此偏角与入场轨迹已写入 Blender 的 `Watering` 动作；宿主只根据相机与地块的相对方位放置根节点，不叠加第二次偏角。`tools/pose-watering-right-hand.py` 记录一次性改姿步骤，同时更新 Blender 预览中的出水轨迹。
- `splash-2x2.png`：原样复制自 Farmlands `SharedResources/Textures/ParticleEffects/T_Splash_4x4.png`。项目内按实际帧布局命名；源文件名写作 4x4，实际图像为 **2×2 四帧**，黑底，使用加法混合与序列播放。空中水滴使用运行时生成的柔边粒子纹理。

素材来自本地 Farmlands 素材库，沿用其原有授权。此 GLB 仅用于水壶道具；农作物继续由程序化配方生成。生产构建按该文件的精确字节放行道具，继续拒绝其他 GLB/glTF。

重新导出（只读取 Blender 项目，不保存或重开 GUI）：

```sh
blender --background /Users/xingyi/Documents/data/unity/farmlands-crops/blender/Farmlands-Library.blend --python-exit-code 1 --python world/gallery/shared/farming/tools/export-watering.py
```

动作时序与粒子参数见 `presentation/watering/WateringConfig.ts`。0.50 秒开始出水，1.50 秒停止新粒子；旧粒子自然落下。水花按照中心轨迹的飞行时间延后触发。土壤视觉过渡在首次落水时释放，湿度业务值仍在浇水事务成功时确认。

Blender 导出后，执行 `node world/gallery/shared/farming/tools/encode-prop-textures.mjs` 完成纹理去重、压缩和 GLB 外部引用转换。

水面已保存在原 Blender 项目中，可直接编辑 `WateringWater`、其形态键及 `WateringWaterLevel` 动作。`tools/add-watering-water.py` 是首次添加水面的作者脚本：通过 CLI 运行，先备份原项目再保存；已有水面时会拒绝重复创建。导出器将壶体与水面当前动作合并为同一个 `Watering` 动作，由 Prefab 引用的单个控制器同步播放。

一个水壶实例复用所有地块；播放期间最多保留一个最新目标，不重启当前动作。加载失败时释放土壤过渡并保留已确认业务状态；场景关闭时清理道具实例、粒子及待播放请求。资源管理器加载的 Prefab、控制器、GLB 与水花纹理由引擎管理。
