# Scene_Demo 光照对照

用户确认：只在轻量 Water/Planner 预览增加光照对照，完整 SeedWorld Planner 保留原光照。默认仍为原预览光照；左上角“光照对照”切换 Scene_Demo 参数，切换不经过作者编辑、Terrain 准备或水体重新发布。

来源：授权的 `farmlands-viewer/Assets/Polyart/PolyartStudio/Farmlands/Scenes/Scene_Demo.unity`、`Materials/Terrain/M_Farmlands_Skybox.mat`。未修改原工程。

- `farmlands-sky-day.png` 直接复制 `Textures/Terrain/T_Farmlands_Skybox_Day.png`；SHA-256：`3595a7a3d1194ff2996dfc5cd443db4c55aeadc52f8e35b7087e2d78ac2224ba`。
- 天空原始 PNG 为 3840×2160 sRGB；运行时按源场景反射分辨率生成 512² cubemap，按既有 128²/64 samples IBL 配置预滤波。三维方向、天空旋转按 Unity→Galacean 的 Z 镜像转换，原天空曝光 1.2、旋转 311°、Tint 均来自材质。
- 主光使用源颜色、1.2 强度及 Sun 世界方向；主光色按线性空间计算。RenderSettings 三色环境光通过球谐投影适配；反射强度 0.5，指数雾密度 0.0011。
- 当前参考工程的后处理组件丢失，不能据此猜测一套原版 Tone Mapping。对照模式使用线性光照及引擎最终 sRGB 输出，关闭原预览的 ACES、+1 EV、暖色与 Bloom。切回原模式恢复原输出配置。
- 对照环境首次切换时在隐藏 Scene 中准备并缓存，成功后切换；失败保留原环境，释放准备资源。缓存属于当前预览 Scene，页面销毁时释放。

边界：三色环境光是 Galacean SH 适配，并非直接导入 Unity 烘焙探针。原 Sun 的 CloudRenderer 动态 cookie 暂未复现，Galacean DirectLight 当前无 cookie 接口；界面明确提示此差异。不为近似云影而压暗全局，不把它称为 Unity 逐像素复刻。Planner 地形、岸坡、植被和相机也不同于原场景。
