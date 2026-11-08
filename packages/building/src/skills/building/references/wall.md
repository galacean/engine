# 墙和开口

## 附件

欧式生成器通过 attachments 指定窗口和门等配置，形成独立的基础构件和 host 关系。窗、门、灯都是使用 `attachmentMount`、`mountAttachment`、`nativeAttachment` Unit 和明确 host 关系的构件。kind 和 type 使用实际的装饰目录。尺寸和资产选择都要明确写出。

设计阶段共享开口和接触预留，实施阶段铺普通墙砖和连接砖。原始墙 support 不保存算出的洞口缓存，也不要保存第二份生成的开口缓存。移动或删除邻居后，重新设计。

## 墙上的两种挂点

两种写法只能用一种，不要同时保存。

**UV 挂点：** `spec.u` 是 [0,1) 的周向参数，不是米。`spec.bottom`、width、height 的单位是米。平移 UV 挂点会被拒绝，要编辑 UV 坐标。

**Point 挂点：** `support.params.point: [x,y,z]` 是宿主墙标准局部坐标中的实际挂接点。此时 spec 不保存 u 和 bottom，设计阶段通过墙面的真实折线投影得到它们。

- 墙 Point 构件的节点可以相对宿主平移。平移会叠加到挂点并重新求解开口。
- 相对旋转和缩放会被拒绝，要修改几何或 Unit。
- 初始世界把实际挂点存在节点 position 中，support 的 point 为零偏移。非零 point 加同框节点同样有效。

屋顶挂点使用 `spec.uv` 和以米为单位的 `spec.bottom`，不通过节点平移改安装位置。

## 自定义曲面

自定义 meshSurface 不会自动获得欧式 window-cottage 的开洞能力。要通过自定义 connection rule 修改真实几何和铺设范围，并派生窗框构件。不支持的内置规则会明确报错。

## 窗门的分阶段流程

普通墙窗、转角窗、门和壁灯的 `attachmentMount` 在设计时解算为精确 Point，同时发布开口和碰撞占位。`mountAttachment` 在实施时使用该 Point、资产选择和材质参数生成窗门网格，设计时不生成普通附件的渲染网格。

可以注册替代的挂接算法，返回 `native-attachment/v1`。改放置位置不会自动移动已有的墙洞，要同时修改作者挂点并重新设计。转角窗包含窗口和两根过梁的资产成员挂点，替代铺设算法要处理所有成员。

半老虎窗也走挂点和派生小屋面的分阶段流程。协议和开口约束见[屋顶](roof.md)。
