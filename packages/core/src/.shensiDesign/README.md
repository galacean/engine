### 背景：

- Engine 作为整个 Oasis 引擎的控制器，一个 Engine 应该只能对应一个 context（WebGL 对应 canvas 画布）。而目前保存 canvas 的 RHI 保存在 Camera 里面, 则会存在 Engine 一对多 context 的不合理情况。
- Engine 目前没有充分解耦，如 engine.run 不能单独控制 render 哪一个 Scene；多场景中的 currentScene 没有物理意义。
- Engine 作为“总控制器”，功能还不够完善。
- Const 变量模块可以考虑放在 Engine static 里面？
- 场景管理不合理，包括和节点、组件等之间的关系，需要重新设计下之间的关系并提高易用性。
