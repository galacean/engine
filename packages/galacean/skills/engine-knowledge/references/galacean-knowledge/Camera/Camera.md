# Galacean Camera

## 它是什么
- 场景渲染入口的组件，挂在实体上，通过视图/投影矩阵、清屏和输出目标决定画面如何生成。
- 支持透视/正交投影、多相机组合、离屏渲染（RenderTarget）、HDR/后处理/抗锯齿等特性。

## 简述
- 结合 `Transform` 获得视图矩阵，结合投影参数形成投影矩阵，按 `cullingMask` 过滤可见物并交给渲染管线。
- `clearFlags` 决定清屏策略；`priority` + `viewport` 组织多相机；可输出到主画布或自定义 `RenderTarget`。

## 关联
- `Transform`（相机朝向/位置来源，依赖组件）
- `Layer` / `cullingMask`（过滤渲染层）
- `Scene.background`（`CameraClearFlags.Color*` 使用场景背景色/纹理/天空）
- `RenderTarget`（离屏渲染/RTT），`pixelViewport`/`viewport`
- 空间转换：`worldToViewportPoint`/`viewportToWorldPoint`、`worldToScreenPoint`/`screenToWorldPoint`、`screenPointToRay`
- 抗锯齿：`msaaSamples`（几何）、`antiAliasing`（屏幕后处理）
- 可选输出：`enableHDR`、`opaqueTextureEnabled`、`depthTextureMode`
- 后处理：`enablePostProcess` + `postProcessMask`

## 怎么用
1) 创建实体并添加 `Camera`，用 `Transform` 确定视点。
2) 选择投影：`isOrthographic` + `orthographicSize` 或 `fieldOfView`；设置裁剪面 `nearClipPlane`/`farClipPlane`。
3) 配置渲染：`clearFlags`、`cullingMask`、`priority`、`viewport`（修改后重新赋值）。
4) 需要时绑定 `renderTarget`、开启 HDR/后处理/抗锯齿。

## Best Practices
- 分层渲染：用 `cullingMask` 把 UI/特效分到独立 Layer，再用多相机 + `priority` 组合。
- 近平面尽量大、远平面尽量近，减少深度精度问题；正交相机用 `orthographicSize` 控制尺寸。
- 修改 `viewport`/`pixelViewport` 后重新赋值以触发更新；多相机画中画用不同 viewport。
- 离屏/RTT：设置 `renderTarget`，用完后销毁 RenderTarget 或交给资源管理器释放。
- HDR/后处理：仅在设备支持（WebGL2 或 half-float）时开启 `enableHDR`；需要后处理时同时打开 `enablePostProcess` 并设置 `postProcessMask`。
- 屏幕坐标原点在左上；当使用子 viewport/RenderTarget 时，屏幕坐标基于对应画布像素，注意传入的 z 距离单位是世界单位。

## Few-shot（常见需求提示）
- “画中画/小地图” → 第二个相机设置 `viewport = new Vector4(x, y, w, h)`，`priority` 高于主相机，`clearFlags = ColorDepth`。
- “正交 2D 相机” → `isOrthographic = true`，用 `orthographicSize` 控制视域，`cullingMask` 只渲染 2D 层。
- “RTT 输出到纹理” → 创建 `RenderTarget` 并赋给 `camera.renderTarget`，在材质中采样 renderTarget 的纹理。
- “获取深度/不透明纹理供自定义效果” → 设置 `depthTextureMode = DepthTextureMode.PrePass`，或开启 `opaqueTextureEnabled` 后在 shader 访问 `camera_OpaqueTexture`。
- “屏幕抗锯齿” → 保持 MSAA 以平滑几何边缘，或启用 `antiAliasing` 进行屏幕后处理。
- “屏幕点击拾取/指向” → 用 `screenPointToRay` 获得射线，再做碰撞检测或与平面求交。

## Notes / Warning
- 修改投影/视口等关键参数后需重新赋值相关向量，以确保更新标记生效。
- 开启 HDR 时若硬件不支持，内部会警告并跳过；需要透明画布叠加时设 `isAlphaOutputRequired = true`。
- 深度/不透明纹理、后处理会增加带宽开销，在移动端谨慎开启。
- 离屏渲染时 RenderTarget 尺寸应匹配期望输出（窗口缩放时需要重建）。
