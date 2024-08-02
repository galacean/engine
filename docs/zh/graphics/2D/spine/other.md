---
order: 4
title: 版本与性能
type: 图形
group: Spine
label: Graphics/2D/Spine/other
---

### Spine 版本
@galacen/engine-spine 自 1.2 版本后开始支持 spine 4.x 版本。<br>
从 1.2 版本后，@galacen/engine-spine 包的 major version 和 minor version 与 spine 版本完全对应，版本对照如下：<br>
- @galacean/engine-spine <= 1.2 对应 spine version 3.8
- @galacean/engine-spine  4.0 对应 spine version 4.0
- @galacean/engine-spine  4.1 对应 spine version 4.1
- @galacean/engine-spine  4.2 对应 spine version 4.2
- .....

目前已发布 4.2 beta 版本，4.1， 4.0 版本会陆续发布

### 版本升级
升级到编辑器 1.3 版本后。除了需要在编辑器的[项目设置](https://antg.antgroup.com/engine/docs/latest/cn/interface-menu#%E9%A1%B9%E7%9B%AE%E8%AE%BE%E7%BD%AE)中升级引擎版本外，由于导出 JSON 或者二进制的 Spine 编辑器版本需要与运行时版本[保持一致](https://zh.esotericsoftware.com/spine-versioning#%E5%90%8C%E6%AD%A5%E7%89%88%E6%9C%AC)，所以编辑器升级到 1.3 后，`还需要重新导出 4.2 版本的 Spine 资产并上传到编辑器，通过文件覆盖完成资产的更新`。

### 性能建议
这里提供一些优化 spine 动画性能的方法：

1. 使用二进制文件（.skel）的形式导出 skeleton，二进制文件的体积更小，加载更快。
2. 建议将附件打包到尽可能少的atlas页中, 并根据绘制顺序将附件分组置入atlas页以防止多余的material切换. 请参考：[Spine 纹理打包：文件夹结构](https://zh.esotericsoftware.com/spine-texture-packer#%E6%96%87%E4%BB%B6%E5%A4%B9%E7%BB%93%E6%9E%84)了解如何在你的Spine atlas中编排 atlas 区域。
3. 少用裁减功能。Spine 的裁减实现是通过动态裁减三角形实现的，性能开销很大。
4. 尽可能少地使用atlas page textures。即，导出是贴图的数量尽可能控制在一张。

### 提问
对于 Spine 有任何问题，欢迎在 @galacean/engine-spine [创建 issue](https://github.com/galacean/engine-spine/issues/new)