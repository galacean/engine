# 播种表现

## 实现约定

- 播种事务成功后播放种子落下，落点集中在当前耕地中央，覆盖约 0.33 米范围。
- 落地后停留约 3 秒，再用 0.6 秒沉入土中并缩小消失。Blender 动作 4.3 秒，单粒错开 0.028 秒，最多约 4.66 秒结束。
- 播种不改变土壤网格、法线、轮廓或准备状态。锄地、耙地、地形编辑和湿度仍由原土壤模块负责。
- 作物和存档立即确认；动画是临时表现，不占库存、不延迟保存，不使用作物成长时钟。
- 刷新、恢复 Scene/Prefab、跨页快照同步及相同命令重试不重播。作物移除、地形不可用、组件/系统关闭或销毁时清理效果。

## 素材与生成

来源为 `farmlands-viewer/Assets/Polyart/PolyartStudio/Farmlands`，遵循已有 Farmlands 素材包授权，不单独转授素材。

| 数据 | 原模型与颜色 | 用途 |
| --- | --- | --- |
| small.json | SM_Farm_Seeds_01 LOD0，14 粒；T_Farm_LeavesAtlas_01.tga | 普通蔬菜、葡萄、油菜籽、向日葵等 |
| grain.json | SM_Farm_Seeds_02 LOD0，10 粒；T_Farm_Vegetables_C.tga | 小麦、水稻 |
| pumpkin.json | SM_Farm_PumpkinSeeds_01 LOD0，3 粒；T_Farm_Pumpkin_C.png | 南瓜、甜瓜、西瓜 |

JSON 保留原独立种子的顶点、三角面、法线、中央落地偏移及 UV 对应颜色，转换为米制 Y-up。运行时用 `ModelMesh` 构建并在组件内复用，不请求 GLB、FBX 或外部贴图。每份数据记录原 FBX 和颜色贴图 SHA-256。

`sowing-motion.json` 是 Blender 创建的 `Sow_Seeds` 动作，按 30 FPS 烘焙 130 帧，包括放出、落下、轻微弹起、停留、沉入。共享 `SowingMotion.ts` 采样时间轨迹，所有物种复用该动作。

```bash
blender -b --factory-startup --python-exit-code 1 \
  --python world/gallery/shared/farming/tools/export-sowing.py -- \
  --source /path/to/farmlands-viewer/Assets/Polyart/PolyartStudio/Farmlands
```

导出不保存或修改原 FBX、贴图、Unity Prefab 和 Farmlands Library。

## 共享接入

`FarmingAreaComponent` 默认创建 `SowingPresenter`，订阅服务确认的 `crop-planted` 事件并更新动画。原生 API 和农场 UI 走同一条事件链路。通过 `FarmingAreaDependencies.sowingPresentation: false` 可关闭；默认沿用 `storagePresentation` 的无渲染宿主选择。

独立宿主从 `shared/farming/presentation` 导入 `SowingPresenter`，传入区域实体、服务、耕地中心和实际表面采样器，每帧 `update(actualDeltaTime)`，关闭时 `setActive(false)`，退出时 `dispose()`。种子采用世界坐标，不继承区域实体的偏移/缩放。

农场案例设置 `area.sowingPresenter.surface = plotId => scene.getSowingSurface(plotId)`，每粒种子分别采样已锄/已耙的实际土壤高度。默认原生宿主使用领域地形；拥有自定义土壤网格的宿主应提供自己的表面采样器。

## 验证

- `sowing-motion.spec.ts`：落下、停留、消失、错峰、原网格与中央范围。
- `sowing-presenter.spec.ts`：事件来源、去重、贴地采样、作物移除、组件关闭、销毁。
- `sowing.e2e.spec.ts`：真实选种/播种按钮、原生 API、不同种子、变形地面、播种前后土壤网格上传次数和包围盒一致、刷新不重播、拒绝重复播种、命令重试、独立原生宿主以及组件生命周期/GPU 缓冲释放。

2026-10-13 验证：种植测试 47 文件 / 436 项通过；播种浏览器 3 项、生产页面 2 项、锄地→耙地→播种→浇水→还原/收获完整流程 1 项通过；种植类型检查、83 项 Native API 声明检查、农场与 Native 生产构建通过。生产清单仍为 14 种配方、0 个作物模型、6 个原有静态道具。内置浏览器另验证正常站立视角的真实按键播种；关键帧预览为浏览器截图合成，不是逐帧录屏。

本次实现种子的播种动作，未额外制作人物手臂、种子袋或播种机。
