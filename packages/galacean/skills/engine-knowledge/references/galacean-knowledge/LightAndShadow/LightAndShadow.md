# Galacean Light & Shadow

## 它是什么
- 光照系统包含直接光（方向光/点光/聚光）、间接光（环境光/环境光遮蔽），并支持实时阴影（含级联、透明阴影）。
- 阴影基于 ShadowMap，场景/灯光/渲染器均可配置是否投射与接收。

## 简述
- 光源：`DirectLight`（平行光，支持阴影与级联）、`PointLight`、`SpotLight`；数量建议控制（单类最多 10 盏）。
- 环境：`Scene.ambientLight`、`Scene.ambientOcclusion`，主光源 `scene.sun` 影响阴影选取（未设则取最亮方向光）。
- 阴影：场景开关 `castShadows`、分辨率/距离/级联/透明阴影；灯光参数 `shadowType`、`shadowBias`、`shadowNormalBias`、`shadowNearPlane`、`shadowStrength`。
- 接收/投射：渲染器（`MeshRenderer`/`SkinnedMeshRenderer`/`SpriteRenderer` 等）具备 `castShadows/receiveShadows` 控制。

## 关联
- 组件：`DirectLight`、`PointLight`、`SpotLight`
- 场景：`scene.sun`、`ambientLight`、`ambientOcclusion`、`castShadows`、`shadowResolution`、`shadowCascades`、`shadowDistance`、`enableTransparentShadow`
- 渲染器：`castShadows`、`receiveShadows`
- 阴影类型/枚举：`ShadowCascadesMode`、`ShadowResolution`、`ShadowType`

## 怎么用
1) 创建光源：在实体上添加 `DirectLight/PointLight/SpotLight`，调整颜色、强度、范围/角度。
2) 设置环境光：创建 `AmbientLight` 并赋给 `scene.ambientLight`。
3) 开启阴影：场景开启 `castShadows=true`，选定主方向光（设置 `scene.sun` 或默认最亮），在灯光上配置阴影参数；在需要投射/接收的渲染器上启用对应开关。
4) 根据场景尺度调整阴影距离/级联与分辨率，兼顾性能。

## Best Practices
- 控制灯光数量，移动端建议 1~2 盏主光 + 环境光；阴影仅在核心方向光上开启。
- 近平面尽量大、远平面尽量近，配合 `shadowDistance`/级联分布减少锯齿与抖动。
- 阴影偏移：适当调整 `shadowBias`/`shadowNormalBias` 消除彼得潘效应与光洩；不同模型需微调。
- 透明阴影仅在需要时开启（`enableTransparentShadow`），会增加渲染成本。
- 大场景使用级联阴影，提高近处精度；小场景可关闭级联节省性能。
- 环境光遮蔽（AO）会增加额外的采样与带宽消耗，移动端或性能敏感场景谨慎开启或降低强度/半径。

## Few-shot（常见需求提示）
- “只让一盏灯投阴影” → 设置 `scene.sun = thatLight`，其他方向光关闭阴影。
- “阴影抖动/锯齿” → 提高 `shadowResolution`、开启级联、或缩小 `shadowDistance`。
- “透明材质没有阴影” → 场景开启 `enableTransparentShadow`，材质确保 Alpha Cutoff/透明正确。
- “室内环境过暗” → 提高环境光颜色/强度，或增加点光/聚光补光。

## Notes / Warning
- 阴影渲染会增加 DrawCall，开启后性能开销显著，移动端需谨慎。
- `scene.castShadows` 为总开关；关闭后单灯阴影配置不生效。
- 阴影仅支持一盏方向光；未设置 `scene.sun` 时会自动选最亮方向光。
- 模型法线/尺度异常会导致阴影破碎，确保模型规范与法线正确。
