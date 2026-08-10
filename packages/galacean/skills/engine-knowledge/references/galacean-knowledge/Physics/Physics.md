# Galacean Physics

## 它是什么
- 可插拔物理系统，提供碰撞检测、刚体动力学、关节约束与射线/形状查询。
- 后端实现：轻量版 `@galacean/engine-physics-lite`（碰撞检测）与完整版 `@galacean/engine-physics-physx`（刚体/关节/CCD 等）。

## 简述
- 引擎创建时注入物理后端：`physics: new LitePhysics()` 或 `new PhysXPhysics()`；编辑器可在项目设置中选择。
- 组件：`DynamicCollider`（自身拥有质量、速度、受力等动力学属性）/`StaticCollider`（静态碰撞），两者都通过 `ColliderShape` 定义形状；另有 `CharacterController` 与关节组件。
- 查询：通过 `scene.physics.raycast/raycastAll/shapeCast` 等完成射线/形状检测；`InputManager` 拾取依赖物理初始化。
- 调试：`PhysicsDebug` 可视化碰撞体。

## 关联
- 包：`@galacean/engine-physics-lite`、`@galacean/engine-physics-physx`
- 组件/类：`DynamicCollider`、`StaticCollider`、`CharacterController`、`BoxColliderShape` 等；`Joint` 系列（Hinge/Spring/Fixed）
- 管理器：`scene.physics`（每个场景持有物理世界）

## 怎么用
1) 创建引擎时选择后端。
2) 在实体上添加 `StaticCollider` 或 `DynamicCollider`、形状与必要的关节；通过 `ColliderShape` 设置尺寸/材质（摩擦/弹性）。
3) 使用 `DynamicCollider` 控制质量、力、速度和重力开关；或用 `CharacterController` 处理角色移动。
4) 使用当前场景的 `scene.physics.raycast` 等做拾取或逻辑。

## Best Practices
- 简单交互选 Lite，真实物理/关节/CCD 选 PhysX；注意包体积与 wasm 加载。
- 设置合适的碰撞层与触发器，减少无关碰撞；开启/关闭 `isTrigger` 控制触发事件。
- 为动态物体设置合理质量/惯性、中心、最大角速度，避免模拟不稳定；使用连续碰撞检测处理高速物体。
- Raycast/ShapeCast 在频繁调用时复用 `Ray`/结果对象，减少分配。
- 使用 `PhysicsDebug` 调试碰撞体对齐，确认缩放/偏移正确。

## Few-shot（常见需求提示）
- “只要碰撞不需要动力学” → 使用 `StaticCollider` + `ColliderShape`。
- “角色控制器” → 添加 `CharacterController`，用 `move` 实现带碰撞的移动。
- “铰链门” → 使用 `HingeJoint` 约束两个刚体。
- “高速子弹穿透” → 在 PhysX 后端开启 CCD（对应刚体或全局设置）。

## Notes / Warning
- 未初始化物理后端时，物理组件和拾取不可用；确保创建引擎时传入 `physics`.
- 不同后端能力差异：Lite 不支持力学/关节/CCD，选择前确认需求。
- 网格碰撞体开销大，尽量使用简单形状组合；缩放时注意形状尺寸同步。
