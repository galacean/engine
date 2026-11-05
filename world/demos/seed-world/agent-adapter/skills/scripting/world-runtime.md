# 世界运行时接口

这些模块已由 `@galacean/engine` 导出。声明和注释来自当前的 Engine 源码，与游戏使用同一个模块实例。

- [日夜：时钟、配置和系统](declare/engine/node_modules/@galacean/engine-core/types/lighting/dayNight/index.d.ts)
- [天气：状态、预设和过渡](declare/engine/node_modules/@galacean/engine-core/types/lighting/weather/index.d.ts)
- [风：采样、发射器和响应](declare/engine/node_modules/@galacean/engine-core/types/lighting/wind/index.d.ts)
- [体积云：材质和配置](declare/engine/node_modules/@galacean/engine-core/types/lighting/volumetricClouds/index.d.ts)
- [环境光和探针](declare/engine/node_modules/@galacean/engine-core/types/lighting/environment/index.d.ts)

导入系统类不会取得世界当前生效的系统实例。新建 WeatherSystem 或 WindSystem 会得到一个独立实例。宿主持有当前的日夜、天气、风、地形和水体运行时，不会隐式注入到 Script 资产。

要持久修改当前世界，使用对应的世界系统 Skill。编写 Script 行为时，使用 Engine 的 Entity/Component 访问和公开的 Scene 接口，例如 `scene.environmentLighting`。Demo 内部的地形和水体宿主类不是可导入的包接口。选择入口前先读声明，不要编造 `scene.weather`、`scene.wind` 或全局世界对象。
