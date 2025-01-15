---
order: 4
title: 版本与性能
type: 图形
group: Spine
label: Graphics/2D/Spine/other
---

### 版本升级与变更 （1.4）
升级到编辑器 1.4 版本后。除了需要在编辑器的[项目设置](/docs/interface/menu/#项目设置)中升级引擎版本外，还需要注意 1.4 Spine API 的修改：
1. 我们不再推荐使用：添加组件`addComponent(SpineAnimationRenderer)` + 设置资源`set SpineResource` 的方式创建 Spine 动画了。</br>
1.4 版本，我们给 SpineResource 添加了一个实例化方法 `instantiate`。`instantiate`方法返回一个使用了该资源的 Spine 动画实体。这比过去的创建方式更加快捷方便～
2. `defaultState` 更名为 `defaultConfig`。该参数的含义是 Spine 动画默认状态下的配置项。我们调整了参数命名，使其更加便于理解。
3. 删除了默认状态下的缩放`scale`配置。过去 scale 参数的目的其实是为了处理 Spine 动画的像素比例，让 Spine 动画大小与引擎中其他物体保持一致。1.4 版本，Spine 无需再通过设置默认缩放来修正其尺寸了。我们推荐大家通过修改 Entity 的 `scale`参数，来缩放 Spine 动画。
4. 1.4 新增了 `premultipliedAlpha` 参数用于开启预乘模式渲染。当 Spine Editor 导出动画时，纹理打包勾选了预乘，此时需要开启 `premultipliedAlpha` 开关。


### 性能建议
这里提供一些优化 spine 动画性能的方法：

1. 使用二进制文件（.skel）的形式导出 skeleton，二进制文件的体积更小，加载更快。
2. 建议将附件打包到尽可能少的atlas页中, 并根据绘制顺序将附件分组置入atlas页以防止多余的 material 切换. 请参考：[Spine 纹理打包：文件夹结构](https://zh.esotericsoftware.com/spine-texture-packer#%E6%96%87%E4%BB%B6%E5%A4%B9%E7%BB%93%E6%9E%84)了解如何在你的Spine atlas中编排 atlas 区域。
3. 少用裁减功能。Spine 的裁减实现是通过动态裁减三角形实现的，性能开销很大。
4. 尽可能少地使用atlas page textures。即，导出是贴图的数量尽可能控制在一张。。
5. 尽量尝试用一个 atlas texture 覆盖多个骨架。比如，可以在同一个 Spine 工程里添加多个骨架，导出时，选择单一图集。这样多个骨架会对应同一个 atlas texture。


### 提问
对于 Spine 有任何问题，欢迎在 @galacean/engine-spine [创建 issue](https://github.com/galacean/engine-spine/issues/new)