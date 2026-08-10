# Galacean Spine

## 它是什么
- 基于 @galacean/engine-spine 的 Spine 动画支持，使用 Spine 导出的 skeleton 数据（.json/.skel + .atlas + 贴图）在引擎中播放骨骼动画。
- 通过 `SpineAnimationRenderer` 组件渲染，支持皮肤切换、动画队列/混合、预乘 Alpha 等设置。

## 简述
- 资产：上传 SpineSkeletonData（含骨骼数据与贴图/atlas），可在编辑器拖入场景生成带组件的实体；运行时可用 `resourceManager.load({ type: "Spine" })`。
- 组件属性：`defaultConfig.animationName/loop/skinName`、`priority`、`premultipliedAlpha`、`zSpacing`。`resource` 已弃用；动态创建优先通过 `SpineResource.instantiate()`。
- 动画控制：通过 `state` 暴露 Spine `AnimationState` API（setAnimation、addAnimation、setMix、setEmptyAnimation 等），可获取 `skeleton` 做骨骼/插槽操作。
- 版本：需安装 `@galacean/engine-spine`，保持与引擎版本匹配。

## 关联
- 依赖包：`@galacean/engine-spine`
- 组件：`SpineAnimationRenderer`
- 资产类型：`Spine`（资源管理器加载），SpineSkeletonData（编辑器资产）
- API：`resource.instantiate()`、`renderer.state`（AnimationState）、`renderer.skeleton`

## 怎么用
1) 安装包：`npm i @galacean/engine-spine`.
2) 在编辑器上传 Spine 资产，或运行时加载 `SpineResource` 后调用 `instantiate()`；通过 `defaultConfig` 设置默认动画、循环和皮肤。
3) 通过 `state` 控制动画队列、混合，或通过 `skeleton` 修改插槽、骨骼、皮肤。

## Best Practices
- 资源导出时保持图片/atlas 路径统一，推荐使用预乘 alpha；与组件的 `premultipliedAlpha` 保持一致。
- 使用 AnimationState 的混合（setMix）平滑过渡，避免硬切动画。
- 大型动画拆分为多个资源或片段，减少加载时间；复用 SpineSkeletonData，多实例化不同实体。
- 性能敏感场景降低骨骼/网格复杂度，谨慎使用大量叠加的 attachment/slot。

## Few-shot（常见需求提示）
- “播放一次然后回 idle” → `state.setAnimation(0,"attack",false); state.addAnimation(0,"idle",true,0);`
- “切换皮肤” → `skeleton.setSkinByName("newSkin"); skeleton.setSlotsToSetupPose();`
- “修改插槽显示” → `skeleton.setAttachment(slotName, attachmentName);`
- “动态创建 Spine 实体” → `spineRes.instantiate()` 并添加到父节点。

## Notes / Warning
- 确保安装的 `@galacean/engine-spine` 版本与引擎版本匹配；版本不符可能导致解析失败。
- 资源路径区分大小写；.atlas 与纹理需与 skeleton 数据一致。
- 预乘 alpha 开关需与导出一致，错误配置会导致边缘变暗或发光。
