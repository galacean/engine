# Farmlands Scene_Demo 瀑布参考资源

参考工程：`farmlands-viewer/Assets/Polyart/PolyartStudio`。Scene_Demo 实际引用 `Farmlands/Prefabs/Waterfalls/PF_Waterfall_01.prefab`（GUID `3cccadfc5f8dcab46a2589542b93a67f`），不是 PF_Waterfall_02。

| 本地文件 | 原始文件（相对 PolyartStudio） | 尺寸 | 采样 |
| --- | --- | --- | --- |
| directional.png | SharedResources/Textures/Water/T_Waterfall_Directional_Noise_02.png | 2048² | sRGB |
| cloud-linear.png | Farmlands/Textures/Water/T_CloudNoise.EXR | 2048² | Linear |
| lines.png | Farmlands/Textures/Water/T_Noise_35.png | 512² | sRGB |
| edge.png | Farmlands/Textures/Water/T_WaterfalEdgeOpacity.PNG | 256×512 | sRGB |
| voronoi.png | Farmlands/Textures/Water/T_Voronoi_03.png | 2048² | sRGB |
| foam.png | Farmlands/Textures/Water/T_Noise_10.png | 512² | sRGB |
| mist.png | SharedResources/Textures/ParticleEffects/T_SmokeFlipbook.tga | 1024²，2×2 | sRGB |
| splash.png | Farmlands/Textures/Water/T_WaterSplashes2.png | 256²，2×2 | sRGB |

除 EXR/TGA 外均按原始字节复制；TGA 通过 Pillow `Image.open(source).save(target_png)` 无缩放转换 RGBA PNG；文件 SHA-256 在 `FarmlandsDropAssets.ts` 中作为资源契约登记，加载时验证。EXR 用 Blender 5.2.1 以 Non-Color 读取并保存为同尺寸 RGBA16 PNG，不施加显示变换。运行时仍使用浏览器 ImageBitmap 和默认 RGBA8 纹理，因此不是原始浮点精度。复现转换：

```python
import bpy
image = bpy.data.images.load(source_exr)
image.colorspace_settings.name = 'Non-Color'
_ = image.pixels[0]  # Force lazy image decode before saving.
image.file_format = 'PNG'
image.filepath_raw = target_png
image.save()
```

外观源为 Water/Materials/Waterfall 01/MI_Waterfall_01.mat、Foam/Impact；sRGB颜色转线性。水帘V从顶到落点、负速度向下，源Impact的+0.35在下游V中适配为-0.35。几何由发布RiverDrop生成，不导入固定FBX或运行Unity ParticleSystem。

原生ParticleRenderer/ParticleMaterial每段生成水雾、飞溅、水滴三类发射器，尺寸/预算随河宽/落差，随机种子来自稳定ID。水雾源PF_WaterfallMistNew/MI_Mist（GUID7156872dfec946b40b0c19e401a2fe74），随机静态2×2帧并上浮/漂移；飞溅源PF_Waterfall_01 Bottom Splashes/MI_WaterSplashes（GUID0f86675fc5c91374684bd40d197542ba），四帧单次、上抛重力回落。发射预算按速率/最长寿命限制，不照搬源场景14–15米雾尺寸。

mistOpacity/sprayOpacity独立；speed=0冻结全部落水动画，隐藏/禁用停止清空、恢复发射；销毁/回滚释放拥有组件/材质，贴图由WaterRuntimeResourceRegistry按Scene共享租约释放。普通无drops河流不请求素材。

这是通用River移植，未逐项复刻源起始噪声、第二泡沫、深度软接触和完整Unity光照；功能不等同逐像素/美术验收。作者与查询边界见 [M1契约](../../../../native/M1_AUTHORING.md)。
