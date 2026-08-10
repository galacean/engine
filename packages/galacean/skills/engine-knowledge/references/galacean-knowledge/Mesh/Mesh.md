# Galacean Mesh

## 它是什么
- 网格资源，供 `MeshRenderer`/`SkinnedMeshRenderer` 渲染。包含顶点属性、索引、拓扑与包围盒。
- 支持三种来源：glTF 导入网格、程序化/自定义网格（`ModelMesh`/`BufferMesh`）、内置几何体 `PrimitiveMesh`。

## 简述
- `ModelMesh`：高层封装，提供 `setPositions/normals/uvs/indices/addSubMesh` 等便捷方法，适合快速自定义几何。
- `BufferMesh`：底层接口，直接操作顶点/索引缓冲与绘制指令，灵活度与性能更高。
- `PrimitiveMesh`：常用预置（立方体、球、平面、圆柱、圆环、胶囊等），本质为已构建好的 `ModelMesh`。
- 网格可包含多个 SubMesh，与渲染器的多材质槽对应；包围盒用于剔除与阴影。

## 关联
- 组件：`MeshRenderer.mesh`、`SkinnedMeshRenderer.mesh`
- 类型：`ModelMesh`、`BufferMesh`、`PrimitiveMesh`
- 相关 API：`setPositions`、`setIndices`、`addSubMesh`、`uploadData`、`bounds`

## 怎么用
1) 使用内置几何体快速创建：`PrimitiveMesh.createCuboid/Sphere/Plane/...`。
2) 自定义几何优先用 `ModelMesh` 的 `setPositions/normals/uvs` 等方法，完成后 `uploadData(true)` 提交到 GPU。
3) 需要完全控制缓冲时使用 `BufferMesh`，直接设置 `vertexBufferBindings` 和 `indexBufferBinding`。
4) 将网格赋给渲染器：`meshRenderer.mesh = mesh;`。

## Best Practices
- 静态网格在上传后调用 `uploadData(true)`，释放 CPU-side 缓冲；动态修改的网格传 `false` 保留数据。
- 复用网格资源，避免重复创建相同 PrimitiveMesh；可缓存全局实例。
- 确保设置法线/切线以获得正确的光照；可用 `calculateNormals` 自动生成。
- 更新顶点数据后如未调用 `uploadData(true)` 需确保调用更新接口以刷新 GPU 缓冲。
- 多 SubMesh 对应多材质槽，渲染顺序受材质 RenderQueue 影响；避免无意义的过多 SubMesh。

## Few-shot（常见需求提示）
- “快速创建胶囊体” → `PrimitiveMesh.createCapsule(engine, radius, height, radialSegments, heightSegments);`
- “想用自定义网格动画” → 使用 `BufferMesh` 动态更新顶点缓冲（保持索引不变）。
- “模型看不到阴影/剔除异常” → 检查网格 `bounds` 是否正确（自定义网格可调用 `generateBoundingBox` 或确保数据完备）。
- “多材质模型” → 使用 `addSubMesh` 分段索引并在渲染器设置对应材质。

## Notes / Warning
- 顶点属性布局需与材质 Shader 需求一致（位置/法线/UV/切线等），缺失会导致渲染异常。
- 动态频繁重建网格会产生 GC 和 GPU 重建成本，优先复用缓冲或采用实例化。
- SkinnedMesh 需具备骨骼权重/索引通道，普通网格无法直接驱动骨骼动画。
