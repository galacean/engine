# Seed 草地风格化交接

## 当前契约

- Seed World 尺寸为 3072m，草色源素材是 `data/seed-world/source/grass/grass-color-field.r8`，格式固定为 256×256 R8。
- Worker 将同一张源图烘焙为 384×384 RG8 世界颜色场：R 是近景重复色块，G 是全世界低频远景色块。
- R 通道使用 `uvScale`、`offset`、`angle`、`softness` 与 `remap`；G 通道使用独立固定世界映射和低通，不随近景参数重新烘焙。
- Terrain 与 Grass 是两个 Shader，但共享同一 RG8 颜色场、A/B 颜色和道路/草地表面权重；远景由 Terrain 在既有距离区间从 R 过渡到 G。
- Seed 不绑定旧 `macro-variation-noise.png`，也不恢复 `terrainAlbedo *= macroVariation`。
- 草的受光法线只基于真实 Terrain Normal 和既有风场弯曲，不再加载、烘焙或采样额外的草团簇高度/法线场。
- R8 Detail Density 仍决定草实例分布，不受颜色场控制。

## 调试面板

`debug=1` 下的 `Road & Grass / 道路与草地` 提供：

- `Grass Density / 草密度`：0–2，默认 1；超过 1 时扩展候选格点，真实增加实例密度。
- `Grass Min Height m / 草最小高度` 与 `Grass Max Height m / 草最大高度`：0.1–2m，默认 0.32–1.71m；只改变 Y，保留草叶 X/Z 占地。
- `Colors / 配色`：道路色、Grass A/B、Saturation。
- `Color Field / 色块变换`：近景 R 通道的重复尺寸、偏移、旋转、柔和与 Remap，以及既有 Vista 混合 uniform 的 0–6000m Start/Full 距离。

统一重置恢复色块、密度 1 和 0.32–1.71m 默认高度范围。

## 数据流

```text
R16 Heightmap ──→ Terrain 几何 / 草根高度 / 真实 Terrain Normal

256×256 R8 Color Field ──→ Worker 384×384 RG8
                              ├─ R：近景重复色块
                              └─ G：远景全世界低频色块
                                       ├─→ Terrain 草层
                                       └─→ Grass 根部颜色

R8 Detail Density × 运行时密度倍率 ──→ 草实例数量
草素材高度 × 运行时 Y 比例 ─────────→ 草实例高度
```

## 验证边界

代码验证只确认资源尺寸、数据通道、Shader/Worker 不再引用额外草法线场，以及密度/高度参数确实进入实例压缩数据。最终颜色、尺度和远近过渡由用户在固定 Seed 1729 的浏览器场景中验收。
