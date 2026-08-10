# Galacean Model（glTF & Prefab）

## 它是什么
- 模型工作流涵盖通用传输格式 glTF（推荐）与引擎内的预制体 Prefab（实体模板资产）。
- glTF 提供网格/材质/纹理/动画/节点/相机等完整场景描述；Prefab 用于复用、批量实例化和同步更新实体树。

## 简述
- glTF：支持 `.gltf/.bin/.png` 与 `.glb`，含核心特性与常用扩展（Draco、KTX2、KHR_lights_punctual、材质变体等）；加载后得到 `GLTFResource`，包含 `defaultSceneRoot`、材质/纹理/动画等。
- Prefab：将实体（含子树和组件）存为资产，加载后通过 `PrefabResource.instantiate()` 生成实例；模板更新可同步实例，必要时可“解开”实例。
- 压缩/插件：配置 `WebGLEngine.create` 中的 `gltf`（如 meshopt worker）、`ktx2Loader` 等项可开启解压/转码；支持自定义 glTF 扩展解析。

## 关联
- 资产类型：`AssetType.GLTF`、`AssetType.Prefab`
- 资源类：`GLTFResource`（`defaultSceneRoot`、`materials`、`textures`、`animations`）、`PrefabResource`（`instantiate()`）
- 组件：`Animator`（使用 glTF 动画）、`SkinnedMeshRenderer`（骨骼/BlendShape）、`Camera`（glTF 相机）
- 扩展：`KHR_draco_mesh_compression`、`KHR_texture_basisu`、`KHR_lights_punctual` 等

## 怎么用
1) 加载 glTF：
   - 单模型：`load<GLTFResource>({ type: AssetType.GLTF, url })`
   - 将 `gltf.defaultSceneRoot` 或指定 `gltf.scene` 节点挂入当前场景。
2) 使用 glTF 动画/材质：获取 `gltf.animations/materials/textures` 赋给对应组件；`Animator` 播放 `gltf.animations`.
3) 预制体：加载 `PrefabResource` 后调用 `instantiate()`，再 `addChild` 或 `addRootEntity` 插入场景；可多次实例化。

## Best Practices
- 优先使用 glTF 2.0；体积优化：启用 Draco/meshopt/ktx2 压缩（导出和引擎配置都需支持）。
- 将 glTF 作为资产导入编辑器，转存为 Prefab 做关卡拼装与同步更新，减少运行时解析开销。
- 大模型分层加载：按场景/Prefab 切分，或用多 glTF 组合以便增量加载。
- 共享材质/纹理：加载一次后复用，避免同资源多 URL 导致重复加载。
- 需要自定义 glTF 扩展时使用 `@registerGLTFExtension`/`@registerGLTFParser` 实现解析逻辑。

## Few-shot（常见需求提示）
- “加载 glTF 文件” → `AssetType.GLTF` + url 指向 `.gltf/.glb`（gltf+bin+贴图或单一 glb 均可）。
- “多个敌人实例” → 加载 Prefab，一次加载，多次 `instantiate()`。
- “切换材质变体” → 使用 KHR_materials_variants，或直接 `renderer.setMaterial` 替换 glTF 解析出的材质。
- “使用 KTX2/Draco” → 导出模型时启用对应扩展，并在引擎配置中设置 `gltf.meshOpt.workerCount` / `ktx2Loader`。
- “编辑器修改预制体同步” → 在编辑器更新 Prefab 资产，运行时实例可按导出逻辑更新；需要与模板脱离时“解开实例”。

## Notes / Warning
- glTF 默认单位为米，坐标系为右手；导出时注意缩放与轴向一致性。
- Prefab 实例化返回的实体未自动添加到父节点，需要手动挂载。
- 对 glTF 解析出来的共享材质/网格进行修改会影响同一资源的其他实例；需要独立参数时克隆材质。
- 压缩扩展需要兼容的环境（KTX2 需浏览器支持 WebGL2 或相关扩展）。
