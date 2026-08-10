# Galacean Assets

## 它是什么
- 引擎的资源系统，统一加载/缓存/引用计数与释放，涵盖纹理、网格、材质、动画、场景、Prefab 等。
- 通过 `engine.resourceManager` 管理；内置一批基础资源供渲染/2D/UI 默认使用。

## 简述
- 加载：`resourceManager.load` 支持单个/批量、自动按后缀推断类型或指定 `LoadItem`（`type/url/retryCount/timeout/retryInterval/params`），返回 `AssetPromise` 可监听进度/取消。
- 缓存：加载成功的资产会缓存在 `url` 与实例 ID 映射中，可用 `getFromCache`/`findResourcesByType` 读取。
- 释放：组件引用计数驱动，调用 `resourceManager.gc()` 释放未被引用的资产；必要时取消未完成加载 `cancelNotLoaded`。
- 自定义加载器：用 `@resourceLoader` 装饰器注册类型与后缀，继承 `Loader` 实现 `load` 返回 `AssetPromise`。
- 内置资源（`BasicResources`）：白色 1x1 纹理（2D/Cube/2DArray/uint）、默认 2D 材质（Sprite/Text/Mask）、Magenta 占位材质、blit Mesh/Material、预过滤 DFG 贴图等，供引擎和调试兜底使用。

## 关联
- 核心入口：`engine.resourceManager`
- API：`load`、`getFromCache`、`findResourcesByType`、`cancelNotLoaded`、`gc`
- 资产类型：`AssetType.GLTF/Texture/Material/Prefab/Scene/Project/...`
- 自定义加载：`@resourceLoader(Type, [exts])` + `Loader.load`

## 怎么用
1) 通过 `load` 异步获取资源，使用返回的实例（材质/纹理/GLTFResource 等）赋给组件。
2) 批量加载时使用数组并监听 `onProgress`；需要中断可调用 `cancelNotLoaded`。
3) 不再使用的实例从场景/组件移除后，调用 `gc()` 释放未引用资源。
4) 需要支持新格式（如 FBX）时注册自定义 Loader。

## 内置资源一览（调试/默认）
- 纹理：`whiteTexture2D` / `whiteTextureCube` / `whiteTexture2DArray` / `uintWhiteTexture2D`（WebGL2）
- 材质：`spriteDefaultMaterial`、`textDefaultMaterial`、`spriteMaskDefaultMaterial`、`meshMagentaMaterial`、`particleMagentaMaterial`
- Mesh/材质：`blitMesh`、`flipYBlitMesh`、`blitMaterial`、`blitScreenMaterial`
- 贴图：`prefilteredDFGTexture`（PBR DFG 预计算）
> 这些资源标记为 GC 忽略，作为默认/占位与后处理 blit 使用。

## Best Practices
- 业务层不要持有废弃资源的引用（材质/纹理/GLTFResource），移除组件或置空引用后再 `gc()`。
- 对频繁加载的公共资产（UI 贴图、角色材质）复用同一 URL，避免重复加载；必要时用 `getFromCache` 复取。
- 控制重试/超时：在弱网或大文件场景调整 `retryCount/retryInterval/timeout`。
- 自定义 Loader 内部尽量使用引擎的 `ResourceManager` 加载依赖，保证引用计数一致。
- 运行时只使用 build manifest 注册的稳定逻辑路径：它等于 Editor canonical VFS path 去掉前导 `/`，并保留用户可见文件名和扩展名，例如 `/Textures/xxx.png` → `Textures/xxx.png`。`.tex`、`.ktx2`、`.shaderc`、CDN URL 等是 Builder 映射的物理实现，`assets/...` 与 `/oss/...` 也都不是运行时资产身份。

## Few-shot（常见需求提示）
- “切换已构建场景” → `sceneManager.loadScene("Scenes/game.scene")`；`AssetType.Project` 由应用启动流程加载，不要在普通玩法脚本里重新加载项目。
- “想取消正在加载的大模型” → `resourceManager.cancelNotLoaded("model.gltf");`
- “资源占用过高” → 清除引用后调用 `gc()`；检查是否重复加载不同 URL。
- “支持新格式” → 实现 Loader + `@resourceLoader` 绑定扩展名。
- “获取所有已加载材质” → `resourceManager.findResourcesByType(Material)`.

## Notes / Warning
- `gc()` 仅释放无引用的资源；仍被组件/脚本持有的实例不会被回收。
- 取消加载会触发 `AssetPromise` 拒绝，调用方需捕获异常；部分 loader 可能没有即时中断网络请求。
- 内置占位资源用于兜底调试，不建议作为正式美术资源使用。
