# Galacean Scene

## 它是什么
- 场景容器，承载根实体集合、环境（背景/雾/环境光/阴影/后处理）及物理世界。
- 每个引擎可有多场景，推荐用 `sceneManager.scenes` 管理；`activeScene` 为旧接口（已废弃），不要依赖。

## 简述
- 提供根实体增删查、全局查找（按名/路径），管理物理 `physics`、后处理 `postProcessManager`、背景 `background`、环境光 `ambientLight`、雾 `fog*`、阴影（分级/距离/透明阴影）。
- `isActive` 控制是否参与更新/渲染；可设置主光源 `sun`（未设时取最亮平行光）。

## 关联
- 引擎/场景管理：`engine.sceneManager`、`scenes`（列表）、`loadScene`、`mergeScenes`
- 根实体：`createRootEntity` / `addRootEntity` / `removeRootEntity` / `rootEntities`
- 环境：`background`（纯色/纹理/天空），`ambientLight`
- 雾：`fogMode`（FogMode.None/Linear/Exponential/ExponentialSquared）、`fogColor`、`fogStart`/`fogEnd`、`fogDensity`
- 阴影：`castShadows`、`shadowResolution`、`shadowCascades`、`shadowDistance`、`shadowFadeBorder`、`shadowTwoCascadeSplits`/`shadowFourCascadeSplits`、`enableTransparentShadow`
- 光照：`sun: DirectLight | null`，`ambientOcclusion`
- 后处理：`postProcessManager`
- 物理：`physics`（场景级物理世界）
- ShaderData：`shaderData`（场景级全局数据）

## 怎么用
1) 获取/创建场景：使用默认场景 `sceneManager.scenes[0]`，或 `const scene = new Scene(engine, "MyScene"); sceneManager.addScene(scene);`。
2) 用 `createRootEntity`/`addRootEntity` 构建层级；通过 `findEntityByName/Path` 做全局查找。
3) 设置环境与效果：背景、雾、环境光、阴影参数、主光源等。需要异步切换可用 `sceneManager.loadScene(url, destroyOldScene?)`；`url` 是 build manifest 注册的 runtime virtual path，例如 `Scenes/game.scene`，不带 Editor canonical path 的前导 `/`。

## Best Practices
- 仅让当前需要的场景 `isActive = true`；非活跃场景不会更新/渲染。
- 渲染排序看 Renderer/Camera：用 Renderer.priority、renderQueue、Material.renderQueue 控制，同层级顺序与 `rootEntities` 列表无关。
- 雾参数匹配场景尺度：线性雾用 `fogStart/fogEnd`，指数雾用 `fogDensity`，避免雾线太近遮挡主视角。
- 阴影成本：提高 `shadowResolution`、开启多级 cascade、透明阴影都会增加开销；在移动端谨慎设置 `shadowDistance`。
- 主光源：若不设 `sun`，自动取最亮的 `DirectLight`，多直射光场景建议显式指定。

## Few-shot（常见需求提示）
- “切换场景” → 已加载场景可设置目标 `isActive=true`；尚未加载的构建场景用 `sceneManager.loadScene("Scenes/game.scene", destroyOldScene?)`。旧场景可设 `isActive=false` 或从管理器移除。
- “查找节点” → `scene.findEntityByName("Player")` 或路径 `scene.findEntityByPath("Root/NPC/Head")`。
- “禁用场景渲染但保留数据” → `scene.isActive = false`。
- “加物理” → 使用场景的 `physics` 创建刚体/碰撞体（取决于物理实现）。
- “开启环境光遮蔽” → 调整 `scene.ambientOcclusion` 参数（如强度/半径）。
- “合并场景” → `sceneManager.mergeScenes(sourceScene, destScene)`，以目标场景的全局信息为准。

## Notes / Warning
- 场景构造后需添加到 `sceneManager` 才会被引擎管理；默认创建的场景已在管理器中。
- `findEntityByName` 返回首个匹配；有重名时优先用路径查找。
- `sun = null` 会回退为最亮的平行光；移除主光源需同步更新场景的直射光组件。
- `enableTransparentShadow` 会增加渲染开销，慎用于大面积透明材质。
- `sceneManager.loadScene` 默认会销毁当前场景（`destroyOldScene=true`），保留旧场景请显式传 `false`。
- `activeScene` 为旧接口，建议使用 `scenes` 列表和 `isActive` 控制。
