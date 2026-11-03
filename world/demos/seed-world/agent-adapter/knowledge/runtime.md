# World runtime APIs

These modules are already exported by @galacean/engine. Their declarations and comments come from the current Engine source, using the same module instance as the game.

- [Day/night: clocks, profiles and systems](../../declare/runtime/node_modules/@galacean/engine-core/types/lighting/dayNight/index.d.ts)
- [Weather: state, presets and transitions](../../declare/runtime/node_modules/@galacean/engine-core/types/lighting/weather/index.d.ts)
- [Wind: sampling, emitters and response](../../declare/runtime/node_modules/@galacean/engine-core/types/lighting/wind/index.d.ts)
- [Volumetric clouds: materials and profiles](../../declare/runtime/node_modules/@galacean/engine-core/types/lighting/volumetricClouds/index.d.ts)
- [Environment lighting and probes](../../declare/runtime/node_modules/@galacean/engine-core/types/lighting/environment/index.d.ts)

Importing a system class does not retrieve the world's active system instance. Constructing a new WeatherSystem or WindSystem creates a separate instance. The host owns its current day/night, weather, wind, terrain and water runtimes; they are not implicitly injected into Script assets.

For persistent changes to the current world, use the [world editing catalog](../world/README.md). For Script behavior, use Engine Entity/Component access and public Scene APIs such as scene.environmentLighting. Demo-local terrain/water host classes are not importable package APIs. Read the declaration before choosing an entry point; do not invent scene.weather, scene.wind or global world objects.
