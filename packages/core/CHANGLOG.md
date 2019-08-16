
### ver 1.2
* 给 Scene 添加 fixedUpdate 时间
* NodeAbility 增加 parent 属性，使得 Event 冒泡机制能够将 Ability 的事件传递到所属的 Node 对象
* NodeAbility修改：enabled 属性设置为 false 之后，此 Ability 对象不再执行 Update
* ACamera.screenToWorld() 和 worldToScreen() 增加 Pixel Ratio 处理