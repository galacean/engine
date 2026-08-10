# Galacean Clone

## 它是什么
- 实体与组件的克隆系统，通过 `Entity.clone()` 快速复制节点树及其组件。
- 支持脚本字段的克隆策略（忽略/赋值/浅拷贝/深拷贝）与自定义克隆钩子。

## 简述
- `Entity.clone()` 会递归复制子节点并为每个组件创建同类型实例，然后按克隆规则拷贝字段；返回的新实体未自动挂回原父节点。
- 默认组件字段使用“赋值”策略（基础类型值拷贝、引用类型共享），脚本可用装饰器定制：`@ignoreClone`、`@assignmentClone`、`@shallowClone`、`@deepClone`。
- 高级定制：实现 `_cloneTo(target, srcRoot, targetRoot)` 或 `copyFrom` 以控制复杂状态/引用；模板资源引用计数会随克隆增加。

## 关联
- API：`Entity.clone()`、`IClone` 接口、`ComponentCloner`、克隆装饰器 `ignoreClone/assignmentClone/shallowClone/deepClone`
- 资源引用：模板(`Prefab`) 会提升引用计数；组件中的资源字段沿用原引用，需按需替换。

## 怎么用
1) 准备一个模板实体（可从场景或 Prefab 加载），调用 `clone()` 生成实例。
2) 将克隆结果插入目标父节点并调整变换/业务字段。
3) 在脚本中用克隆装饰器或 `_cloneTo` 确保自定义状态正确复制。

## Best Practices
- 克隆后立即设置名称/层/变换，避免与模板重名或叠放。
- 对运行时句柄、监听器等不可共享状态标记 `@ignoreClone`，自行在 `onAwake`/`onEnable` 重新创建。
- 数组/对象可按需要选择浅/深拷贝；大对象深拷贝有成本，尽量拆分。
- Prefab/资源字段默认共享引用，若需要独立材质/纹理，请在克隆后替换或实例化材质。
- 函数字段（如 `private _animate = () => {}`）默认也会被赋值到克隆体，若包含闭包/引用需 `@ignoreClone` 并在生命周期中重建。

## Few-shot（常见需求提示）
- “复制一棵节点并改位置” → `const copy = original.clone(); parent.addChild(copy); copy.transform.position = ...`
- “脚本里有计时器不要复制” → 给计时器句柄字段加 `@ignoreClone`，在 `onAwake` 重建。
- “想要独立材质参数” → 克隆后 `renderer.setMaterial(renderer.getMaterial().clone());`
- “数组字段要保持长度与内容，但元素可共享” → 用 `@shallowClone`。
- “复杂对象深度复制” → 用 `@deepClone` 或实现 `copyFrom/_cloneTo`。

## Notes / Warning
- `clone()` 返回的实体未绑定父节点；需手动 `addChild` 才会进入场景/渲染。
- 克隆发生在当前帧，组件的 `onAwake/onEnable` 会在实体激活时触发；避免在构造期间依赖克隆后的状态。
- 深拷贝大量数据会产生性能开销；谨慎使用 `@deepClone` 在大数组/贴图数据上。
