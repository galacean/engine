# Galacean XR

## 它是什么

- 可插拔 XR 能力，覆盖 WebXR（VR/AR）交互。核心包 `@galacean/engine-xr` + 后端 `@galacean/engine-web-xr`，可选工具包 `@galacean/engine-toolkit-xr`。MR 需依赖平台的 AR 能力叠加实现，暂无单独会话模式。
- 不使用时零成本；使用时按需引入后端。

## 简述

- 架构：`XRManager` 负责会话管理、设备能力、空间与输入（手柄/手势）、渲染循环切换到 XR RAF。
- 后端：通过传入 `xrDevice`（如 `WebXRDevice`）初始化，多后端可扩展。
- 工具：Toolkit 提供常用交互/可视化组件，便于在编辑器/运行时快速搭建。
- 兼容性：需浏览器/设备支持 WebXR；进入前做能力检测与降级处理。

## 关联

- 包：`@galacean/engine-xr`（核心）、`@galacean/engine-web-xr`（WebXR 后端）、`@galacean/engine-toolkit-xr`（可选）
- 管理：`engine.xrManager`（进入/退出 XR、获取输入/空间状态）

## 怎么用

1. 安装 XR 相关包并确保版本与引擎一致。
2. 创建引擎时传入后端（如 `xrDevice: new WebXRDevice()`），或在运行时按需加载后端包以扩展 `XRManager`。
3. 进入 XR 前设置 `xrManager.origin`（XR 世界基准，需在会话初始化前设好），并根据模式附加对应相机：
   - AR：将场景摄像机绑定到 `XRTrackedInputDevice.Camera`。
   - VR：绑定左右眼摄像机到 `XRTrackedInputDevice.LeftCamera/RightCamera`。
     可直接使用 toolkit 的 `XROrigin` 组件自动完成 origin 与相机绑定。
4. 调用 `xrManager.enterXR(XRSessionMode.VR|AR)` 进入 XR；使用 toolkit 或自定义组件处理 XR 输入、空间定位与渲染。

## Best Practices

- 确认设备/浏览器支持目标 XR 模式；在不支持时优雅降级。
- 不使用 XR 时不要引入后端以减少包体；按需加载 toolkit。
- 进入 XR 前先设置 origin，进入/退出时同步相机、输入源与渲染循环状态。
- 在编辑器中可使用 toolkit 组件快速搭建基础交互，再按需扩展。

## Few-shot（常见需求提示）

- “进入 VR/AR” → `xrManager.enterXR(XRSessionMode.VR|AR)`。
- “手柄/手势输入” → 通过 `xrManager` 获取输入源，或使用 toolkit 的交互组件。
- “兼容检查” → 检测设备/浏览器 WebXR 支持，必要时提供降级方案。

## Notes / Warning

- 需用户手势触发 XR 会话；浏览器策略可能限制自动进入。
- WebXR 仅在 HTTPS 环境可用；移动端设备支持度差异大。
- 会话退出后恢复正常相机与渲染循环，避免悬挂状态。
