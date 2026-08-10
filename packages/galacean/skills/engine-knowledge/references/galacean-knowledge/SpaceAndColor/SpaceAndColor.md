# Galacean Space & Color

## 它是什么
- 空间：引擎使用统一的右手坐标系定义局部/世界/观察/屏幕/视口空间，`forward` 为 `-Z`。
- 色彩空间：渲染管线按线性工作流计算，屏幕输出自动做 sRGB 校正；采样是否做 sRGB→Linear 由纹理的 `isSRGBColorSpace` 决定。

## 简述
- 局部/世界空间均为右手系；`Transform` 负责在两者之间转换，`Camera` 生成观察/裁剪空间矩阵并提供屏幕/视口转换。
- 屏幕空间以画布左上为原点，像素为单位；视口空间在 `[0,1]` 范围内定义相机输出区域。
- 色彩：无需 `colorSpace` 开关；屏幕（Backbuffer）输出默认做 sRGB 校正。纹理按用途设置 `isSRGBColorSpace`（颜色纹理开启、数据纹理关闭），自定义 RenderTarget 的颜色纹理也要设置正确的 sRGB 标记。
- Shader 接收 `scene_ElapsedTime/DeltaTime` 等统一空间/时间数据，PBR 默认在 Linear 空间完成光照计算。

## 关联
- 组件/类型：`Transform`（位姿）、`Camera`（视图/投影与空间转换）、`Background`、`Layer`/`cullingMask`
- 转换方法：`transform.worldPosition`/`worldMatrix`、`camera.worldToScreenPoint`、`screenToWorldPoint`、`viewportToWorldPoint`
- 配置：无全局 `colorSpace` 选项，直接使用线性工作流
- 纹理：`Texture2D`/RenderTarget 颜色纹理的 `isSRGBColorSpace`

## 怎么用
1) 遵循右手系：`+X` 右，`+Y` 上，`forward=-Z`。旋转为逆时针（面对轴正向看过去）。
2) 使用相机转换 API 进行拾取/投射（屏幕⇄世界），避免手写矩阵。
3) 选择色彩工作流：PBR 推荐 `ColorSpace.Linear`，确保颜色贴图开启 sRGB，法线/金属粗糙度等数据贴图关闭 sRGB。

## Best Practices
- 记住相机朝向是 `-Z`。世界前向使用公开字段 `transform.worldForward`，不存在 `transform.forward`；固定方向玩法也可以直接使用显式 `Vector3`。
- 屏幕/视口原点在左上；自定义 viewport 后转换 API 仍基于当前相机的视口区域。
- 数据纹理（法线、RMA、光照贴图等）使用线性空间；颜色纹理用 sRGB，避免 gamma 叠加导致偏暗/偏亮。
- 屏幕输出自动 sRGB 校正；自定义 RenderTarget 的颜色纹理 `isSRGBColorSpace` 要与实际数据匹配。
- 需要跨场景/节点比较位置时转换到世界空间再计算，避免直接混用局部坐标。

## Few-shot（常见需求提示）
- “物体默认朝向哪里？” → forward 为 `-Z`，右手系。
- “点击拾取场景” → 用 `camera.screenPointToRay` 或 `screenToWorldPoint` 获取射线/坐标。
- “画面偏灰/偏暗” → 检查纹理 `isSRGBColorSpace` 标记与颜色类型是否匹配，屏幕/RenderTarget 的颜色纹理是否按 sRGB 配置。
- “在 UI 相机里放 3D 物体” → 确认 UI 相机的正交/透视配置与 viewport，使用世界坐标放置。
- “多相机叠加” → 注意每个相机的 viewport 空间与屏幕空间起点一致，按 priority 排序。

## Notes / Warning
- 手动修改 `Camera.viewport`、`Transform` 向量需重新赋值对象以触发更新标记。
- 线性工作流依赖硬件支持（WebGL2/扩展），低端设备可能回退或性能受限。
- OffscreenCanvas/多视口场景下屏幕坐标基于目标画布尺寸，获取 pointer 坐标时需匹配对应渲染目标。
