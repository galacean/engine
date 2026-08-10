# Galacean Script（行为脚本）

## 它是什么
- 行为扩展基类，继承 `Script` 为实体编写自定义逻辑。
- 提供完整生命周期（Awake/Enable/Start/Update/LateUpdate/PhysicsUpdate/Render 回调）以及输入/碰撞事件。

## 简述
- 挂载：在实体上 `addComponent(ScriptSubclass)`，生命周期受组件 `enabled` 与实体激活控制（传入构造函数/类而非字符串）。
- 主要回调：`onAwake`（首次被激活且启用，仅一次）、`onEnable`/`onDisable`（每次启停）、`onStart`（`onEnable` 后、首帧 `onUpdate` 前，仅一次）、`onUpdate`、`onLateUpdate`、`onPhysicsUpdate`、`onBeginRender`/`onEndRender`（逐相机调用）。
- 事件：指针 `onPointerDown/Up/Click/Enter/Exit/BeginDrag/Drag/EndDrag/Drop`，触发/碰撞 `onTriggerEnter/Exit/Stay`、`onCollisionEnter/Exit/Stay`。
- 访问：脚本可直接访问 `this.entity`、`this.scene`、`this.engine`、`this.transform` 等。

## 关联
- 基类：`Script`（继承自 `Component`）
- 输入系统：Pointer 事件需碰撞体与拾取（默认物理射线拾取），Keyboard/Wheel 走 `InputManager`
- 物理：触发/碰撞回调依赖物理后端与 collider/rigidbody 设置

## 怎么用
1) 创建自定义类继承 `Script`，实现需要的回调。
2) 将脚本组件挂到实体上；通过 `enabled` 控制启停。需要指针/碰撞事件时，为实体添加合适的碰撞体并确保物理已初始化。
3) 在回调中访问实体、组件、资源，驱动业务逻辑。

## Best Practices
- `onAwake/onStart` 只会调用一次，重复初始化放到 `onEnable`；避免在构造函数访问引擎/场景资源。
- 输入/物理回调可能每帧触发，逻辑保持轻量；避免在回调中销毁仍在迭代的集合。
- 频繁创建脚本实例时复用数据或对象池，减少 GC；释放资源在 `onDisable/onDestroy` 清理。
- 调整组件 `enabled` 控制逻辑暂停而不销毁；需要完全清理时调用 `destroy()`。
- 指针事件依赖碰撞体；未挂碰撞体或未初始化物理将无法触发 `onPointerXXX`（内部会用物理射线处理，无需手动干预）。

## Few-shot（常见需求提示）
- “暂停脚本” → `script.enabled = false;`
- “帧后处理” → 用 `onLateUpdate`。
- “渲染前执行逻辑” → `onBeginRender(camera)`。
- “拖拽物体” → 在 `onPointerBeginDrag/Drag/EndDrag` 中更新 Transform。

## Notes / Warning
- 生命周期受实体激活与组件 `enabled` 双重控制；父节点失活会阻断 `onUpdate` 等回调。
- 触发/碰撞事件依赖 collider 设置与物理后端，确保正确的 `isTrigger`/物理层配置。
- 在回调中调用 `destroy()` 会在帧末销毁，后续回调需判空。
- `onStart` 与 `onAwake` 仅触发一次；重新启用组件不会重复调用。
- 逐相机回调 `onBeginRender/onEndRender` 在有多个相机时会多次触发，避免重度计算。
