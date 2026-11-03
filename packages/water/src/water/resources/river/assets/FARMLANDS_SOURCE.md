# Farmlands Scene_Demo 河流来源

用户授权复用本机farmlands-viewer，未修改源工程。引用链：Scene_Demo.unity Water → Farmlands/Materials/MI_Water_Valley.mat → SharedResources/Shaders/Water/M_Water_Lake_Amp.shader；使用场景实际材质，不改用独立RiverGenerator/MI_River。

| 当前文件 | Polyart/PolyartStudio下原文件 | SHA-256 |
| --- | --- | --- |
| farmlands-wave-large.png | SharedResources/Textures/Water/T_WaveLarge_N.png | 25a717a13b29082b65a62b6ca489412ce9620d8c99ee65a96f626ac153ac3400 |
| farmlands-caustics.png | SharedResources/Textures/Water/T_Water_Caustics_C.PNG | 82024c671895a0a84b362cb2d5170d1ae1ab78139a022dcfc9d00f77bfde299f |

原字节保留：512² linear法线、1024² sRGB焦散，加载核验hash/尺寸；WaterRuntimeResourceRegistry按Scene租用并释放。源颜色按m_ActiveColorSpace:1由sRGB转线性，具体参数只归FarmlandsRiverLook/资源，不进入通用Shader案例分支。

源双法线周期50/100米，速度(0.012,0.015)/(0.02,0.02) UV/秒，混合后强度0.15；折射用第一层。色系数0.09/米、透明度0.53/米（上限0.844）、边缘alpha2.82/米。焦散scale3.08米、intensity4.1、velocity(-0.025,0)、distortion-0.03、衰减1.1/米；ParallaxOffset(0,-0.3,view)对应offset0.15/bias0.42，CausticsOpacity=0只禁止增加opacity。

当前River主法线改为沿路径行进时间输运：尺度0.02，纵向50秒行进时间、横向50米；取消主层固定方向速度。第二层保留源世界速度，强度0.2。其他纹理/光学参数保留；这是河流适配，不宣称完整复刻源世界动画。通用SurfaceAppearance消费色/透明度、混合后法线、第一层折射、边界albedo和焦散，Ocean保持其能力边界。

[河床来源](../../../../../demos/terrain/seed-world-planner/assets/river-bed/SOURCE.md)归Terrain；灯光/相机/颜色输出归宿主，不是Unity场景/全后处理迁移。原参数和当前输运行为的详细契约见 [Water入口](../../../README.md)。
