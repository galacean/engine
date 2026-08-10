# Galacean Entity

## 它是什么
- 组件容器，也是场景层级的节点，承载 Transform 与各类组件（渲染、相机、脚本等）。
- 通过父子关系形成树，`isActive` 控制本地激活，`isActiveInHierarchy` 反映层级激活。

## 简述
- 提供组件的添加/获取（单个/多个/递归），子节点增删、路径/名称查找、克隆。
- 持有 `transform`、`layer`、`scene`、`siblingIndex` 等属性；可监听世界变换变化（`registerWorldChangeFlag`）。

## 关联
- 场景：`scene`（所属场景，随根节点所属）、`layer`（配合 `Camera.cullingMask`）
- 组件：`addComponent` / `getComponent(s)` / `getComponentsIncludeChildren`
- 层级：`parent`、`children`、`siblingIndex`、`createChild` / `addChild` / `removeChild` / `clearChildren`
- 查找：`findByName`、`findByPath`
- 其他：`clone`、`isActive` / `isActiveInHierarchy`、`registerWorldChangeFlag`

## 怎么用
1) 创建实体：通过 `scene.createRootEntity`，或父节点直接 `parent.createChild(name)`，或 `new Entity(engine, name, ...components)`（构造时直接附加组件）后用 `addChild` 加入层级。
2) 添加组件：`addComponent(Camera/Script/Renderer/Collider...)`；获取组件用 `getComponent` 或批量方法。
3) 管理层级：`addChild`、`removeChild`、`siblingIndex` 调整顺序；使用 `layer` 配合相机分层渲染。
4) 查找/克隆：`findByName/Path` 定位节点，`clone()` 复制实体及其子树和组件。

## Best Practices
- 使用 `isActive` 控制局部节点开关，父节点失活会让子节点 `isActiveInHierarchy` 失效。
- 管理层级顺序：`siblingIndex` 影响同级渲染/更新顺序，拖拽或代码调整保持有序。
- 查找优先路径（`findByPath`）以避免重名歧义；名称查找返回首个匹配。
- 批量获取组件用 `getComponentsIncludeChildren` 减少遍历代码。
- 克隆后如包含运行时状态（脚本字段等），记得初始化或重置差异。
- 构造函数可直接传入组件类型，适合模板化创建：`new Entity(engine, "Light", DirectLight)`.

## Few-shot（常见需求提示）
- “把节点挂到另一父节点” → `newParent.addChild(child);`
- “禁用一棵子树” → `entity.isActive = false;`
- “按层过滤渲染” → 选择真实枚举值，例如 `entity.layer = Layer.Layer1`，并把同一 bit 纳入相机 `cullingMask`。
- “复制一个带组件的模板” → `const inst = template.clone();` 设置新位置/名字后插入层级。
- “监听节点移动” → `const f = entity.registerWorldChangeFlag();` 每帧检查 `f.flag`。

## Notes / Warning
- `childCount`、`getChild` 已废弃，使用 `children.length`、`children[index]`。
- `findByName` 仅返回第一个同名；大量查找建议缓存引用。
- `destroy()` 会销毁实体及子树和组件；确保已从父节点移除或不再被引用。
- 层级变更会影响 `isActiveInHierarchy` 和变换更新，频繁移动节点需关注性能。
- `getInvModelMatrix` 已废弃，请改用其他矩阵 API（如 `transform.worldMatrix`）。
