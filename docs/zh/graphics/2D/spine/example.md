---
order: 3
title: 示例与模板
type: 图形
group: Spine
label: Graphics/2D/Spine/example
---

## 模板
Galacean 编辑器提供了一系列教学模板，帮助大家更快的上手 Spine 动画的使用。
进入[编辑器](https://galacean.antgroup.com/editor/projects) 后，你可以点击左侧的 Templates Tab 进入查看这些模板。
</br></br>

**动画控制**

该模板通过展示了如何通过 AnimationState 的 setAnimation 与 addAnimation 两个 API 来编排 spine 动画：
<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*vk7CQLLrTwsAAAAAAAAAAAAADsp6AQ/original" alt="spine-animation" />

**动画过渡与混合**

该模板通过展示了 Spine 动画如何设置过渡以及不同轨道之间的动画混合：
<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*VFbnQZyMqeUAAAAAAAAAAAAADsp6AQ/original" alt="spine-mix-blend" />

**混搭换装**

该模板展示了 Spine 混搭换装的能力，通过自由组合不同皮肤的附件，能够将不同皮肤的配件混搭起来：
<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*AEsoSLT7cqUAAAAAAAAAAAAADsp6AQ/original" alt="mix-and-match" />

**动态局部换肤**

该模板展示了动态局部换肤的能力。我们能够基于一个额外上传的图集创建新的附件并进行替换。
<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*m2GpT7eX_ZwAAAAAAAAAAAAADsp6AQ/original" alt="spine-dynamic-change" />

## 示例

**动画控制**

该示例展示了如何通过 setAnimation 与 addAnimation API 来编排 spine 动画队列：
<playground src="spine-animation.ts"></playground>

**跟踪射击**

该示例展示了通过修改 IK 骨骼位置，来实现瞄准射击的效果：
<playground src="spine-follow-shoot.ts"></playground>

**局部换肤**

该示例展示了修改插槽中的附件，实现局部换装的效果：
<playground src="spine-change-attachment.ts"></playground>

**整体换肤**

该示例展示了通过 setSkin 方法，实现整体换肤的效果：
<playground src="spine-full-skin-change.ts"></playground>

**皮肤混搭**

该示例展示了在运行时，通过组合新的皮肤，实现混搭的效果：
<playground src="spine-mix-and-match.ts"></playground>

**物理**

该示例展示了 spine 4.2 版本，基于物理的动画效果：
<playground src="spine-physics.ts"></playground>



下一章节：[版本与性能](/docs/graphics/2D/spine/other)