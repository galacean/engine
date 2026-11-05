# Seed World Knowledge

Choose the relevant system below and read its README before using unfamiliar capabilities. Each README contains a Usage Guide and an API Reference Index. Read only the declarations needed for the next action. Published document links use project-root paths and can be passed directly to read. Reuse already read information during the task.

Only the API links in the current indexes declare this host's callable capabilities. Domain guides describe the broader system; an API mentioned in their background but absent from the current index is unavailable here. Follow exact declaration links instead of inventing file paths or repeatedly reading unavailable APIs.

In execute, these world APIs live under `tools`, for example `await tools.world.parameters.query(...)`. Component extensions use `await editor.component.query(...)` and the methods declared on the returned proxy. Read the linked declarations for exact input and output fields. Use the complete invocation printed in each method declaration: `spatial.resolve` is `tools.spatial.resolve`, not `tools.world.spatial.resolve`. Knowledge directories are topic groups, not runtime namespaces. A paginated read is incomplete when it returns `next`; follow that offset or the linked method/type entry before relying on a return structure.

When the scene exposes component authoring, the relevant guides include system-owned component usage knowledge for the available components. Discover exact fields, units, scope and constraints through `world.parameters.describe`, then inspect the actual target before proposing edits. System guides explain how capabilities relate; they do not supply fixed mood presets or override the current schema, authorization or runtime checks.

- [对象：查询、检查、删除和标签](object-management/README.md)
- [建筑：生成与原生编辑](building/README.md)
- [空间：位置、相对方位与导航](spatial/README.md)
- [时间与季节](time/README.md)
- [天气与大气](atmosphere/README.md)
- [地形：创建与修改](terrain/README.md)
- [水域：创建与修改](water/README.md)
- [植被：创建单棵树、树林、灌木、草和花，调整已有植被](vegetation/README.md)
- [动物：查询、生成与行为](animals/README.md)
