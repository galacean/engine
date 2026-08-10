# Galacean Renderer

## 它是什么
- 所有渲染组件的基类（MeshRenderer/SkinnedMeshRenderer/SpriteRenderer/TextRenderer/ParticleRenderer 等），负责将几何或 2D 数据与材质提交给渲染管线。
- 管控投射/接收阴影、渲染优先级、材质列表与包围盒。

## 简述
- 属性：`castShadows` / `receiveShadows`、`priority`（同层级排序，越小越先渲染）、`shaderData`、`materialCount`、`bounds`、`isCulled`。
- 材质：支持多材质槽，提供 `setMaterial/getMaterial`、`getMaterials`、`getInstanceMaterial(s)` 以避免共享修改。`getMaterial/getInstanceMaterial` 的返回类型是 `Material | null`；它们不会因为当前 Shader 是 PBR 就变成 `PBRMaterial`。
- 渲染排序：由渲染队列（材质的 `renderQueueType`）、相机层/队列、渲染器 `priority` 与距离共同决定（详见 `/docs/graphics/renderer/order`）。

## 关联
- 常见子类：`MeshRenderer`、`SkinnedMeshRenderer`、`SpriteRenderer`、`SpriteMask`、`TextRenderer`、`ParticleRenderer`
- 阴影：`castShadows/receiveShadows`（配合 `Scene.castShadows` 与灯光）
- 材质 API：`setMaterial`、`getMaterial`、`getMaterials`、`getInstanceMaterial`、`getInstanceMaterials`
- 包围盒：`bounds`（用于剔除与碰撞判断）

## 怎么用
1) 在实体上添加具体渲染器子类并配置几何/精灵/粒子等资源。
2) 设置材质：使用 `setMaterial` 指定槽位；需要独立修改时用 `getInstanceMaterial` 克隆。
3) 控制阴影与排序：`castShadows/receiveShadows`、`priority`；材质的 RenderQueue 配合相机层与距离。

## Best Practices
- 修改材质参数前确认是否与其他渲染器共享；需要独立数据时使用 `getInstanceMaterial(s)` 创建实例。
- `getInstanceMaterial` 会克隆当前槽位材质并返回新实例，`getInstanceMaterials` 可一次性克隆所有槽位，适合多材质 SubMesh。
- Editor `.mat` 资产通过 Script 属性注入时，以及无法证明具体构造来源的 Renderer 材质实例，运行时都应按 `Material | null` 使用。不要写 `as PBRMaterial` / `as UnlitMaterial` 来访问 `baseColor`、`baseTexture` 等具体子类属性；类型断言只改变 TypeScript 视图，不会改变已经反序列化的对象。要改通用内置 Shader 参数，使用 `material.shaderData.setColor("material_BaseColor", color)`、`setTexture("material_BaseTexture", texture)` 等 canonical shader property。
- 调整 `priority` 仅在同一渲染队列内细调顺序；避免滥用过大的优先级差值。
- 更新大量渲染器时重用材质/网格资源，减少状态切换与内存占用。
- 包围盒依赖几何与变换，动态几何更新后需要正确刷新（框架会在 Mesh 变化或 Transform 更新时同步）。

## Few-shot（常见需求提示）
- “让角色不投影” → `renderer.castShadows = false;`
- “只想改一份材质颜色” → `const m = renderer.getInstanceMaterial(0); if (m) { m.shaderData.setColor("material_BaseColor", color); renderer.setMaterial(0, m); }`
- “排序前后层级” → 调整材质 RenderQueue（如 Transparent）并微调 `priority`。

## Notes / Warning
- `getMaterials` 返回的数组内材质为引用，直接修改会影响共享实例；谨慎在运行时修改共享材质。
- `priority` 不是全局排序器，仍受 RenderQueue/相机层/距离影响。
- `isCulled` 反映当前帧视锥裁剪结果，仅在渲染后有效。
