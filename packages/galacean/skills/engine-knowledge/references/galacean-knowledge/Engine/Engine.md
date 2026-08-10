# Galacean Engine

## 它是什么
- 引擎运行时核心，管理渲染循环、场景、资源、输入、时间和设备（WebGL/XR）。
- 通过平台引擎（如 `WebGLEngine`）创建，提供统一的 `run/pause/resume/destroy` 生命周期。

## 简述
- 持有 `sceneManager`（场景切换与遍历）、`resourceManager`（资源加载/缓存）、`inputManager`、`time`、`xrManager` 等核心子系统，提供 `settings` 配置入口。
- 渲染循环默认 `run()` 触发，支持 `vSyncCount` 控制 VSync、`targetFrameRate` 控制无 VSync 时的定时；可接入物理（配置 `physics`）和 ShaderLab。
- `canvas` 提供绘制目标；设备丢失/恢复会自动处理资源丢失与重建。

## 关联
- 平台引擎：`WebGLEngine.create(configuration)`（WebGL1/2）
- 场景/实体：`sceneManager`, `Scene`, `Entity`
- 资源：`resourceManager`（加载/引用计数），`BasicResources`
- 输入/时间：`inputManager`、`time`、`isPaused`
- 循环控制：`run` / `pause` / `resume` / `update`
- 后处理：`postProcessPasses`（只读列表） + `addPostProcessPass`
- 调试/状态：`destroyed`，`forceLoseDevice` / `forceRestoreDevice`
- 配置：`EngineConfiguration`（`physics` / `xrDevice` / `shaderLab` / `input`），`settings`

## 怎么用
1) 通过平台引擎创建（例：`WebGLEngine.create({ canvas })`，`canvas` 必填：元素、OffscreenCanvas 或 id），获取默认场景和根实体。
2) 构建场景（实体、相机、灯光等），必要时设置 `vSyncCount` 或 `targetFrameRate`。
3) 调用 `engine.run()` 启动循环；需要时 `pause()/resume()` 控制；自定义实体可用 `engine.createEntity()` 或场景的 `createRootEntity()`。

## Best Practices
- 首选 `run()` 让引擎管理循环；只有在与外部调度集成（如自定义渲染节流、宿主框架）时才用手动 `update()`。
- VSync 开启时忽略 `targetFrameRate`；需要自定帧率先将 `vSyncCount` 设为 0。
- 物理引擎在 `Engine.create` 配置注入，避免运行时频繁切换。
- 设备丢失（浏览器上下文丢失）会触发自动恢复，确保自定义资源遵守引用计数与恢复流程。
- 多场景时只保留必要的活跃场景，避免无关场景占用更新/渲染。
- 仅在调试 GPU 丢失恢复时使用 `forceLoseDevice` / `forceRestoreDevice`。

## Few-shot（常见需求提示）
- “暂停/继续游戏” → 调 `engine.pause()` / `engine.resume()`，暂停期间不会更新/渲染。
- “自定义帧率（无 VSync）” → `vSyncCount = 0`，设定 `targetFrameRate`。
- “多场景切换” → 已加载场景通过 `isActive` 控制；构建产物中的场景通过 `sceneManager.loadScene("Scenes/game.scene")` 加载并激活。
- “接入物理” → 在 `WebGLEngine.create({ physics })` 传入物理实现；相关组件即可使用。
- “手动驱动循环” → 不调用 `run()`，外部调度中周期性调用 `engine.update()`。
- “模拟设备丢失/恢复” → 调 `engine.forceLoseDevice()` / `engine.forceRestoreDevice()`（调试用）。

## Notes / Warning
- `run()` 内部使用 `requestAnimationFrame`（或 XR 的 RAF），`vSyncCount` 控制跳帧倍数；关闭 VSync 后使用定时器模拟帧率。
- `targetFrameRate` 仅在 `vSyncCount = 0` 时生效；设置过高可能耗电/升温。
- 在帧执行过程中调用 `destroy()` 会延迟到帧结束；如需即时销毁，确保不在更新/渲染中调用。
- 浏览器标签页后台可能降频或暂停 RAF，时间步长可从 `engine.time` 获取以进行补偿。
- `WebGLEngine.create` 需提供有效 `canvas`；`graphicDeviceOptions` 可选。
- 物理系统使用场景的 `physics`。
