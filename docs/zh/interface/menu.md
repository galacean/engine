---
order: 2
title: 主菜单
type: 基础知识
group: 界面
banner: https://gw.alipayobjects.com/zos/OasisHub/adbd922a-f764-4e54-a7e8-891ebd18a074/image-20240319101033970.png
label: Basics/Interface
---

项目管理包括新建项目、克隆项目、项目设置等操作。

<img src="https://gw.alipayobjects.com/zos/OasisHub/b680ec2d-0766-48d1-b8ae-67c5bc2dcf3e/image-20240319100341232.png" alt="image-20240319100341232" style="zoom:50%;" />

### 新建/克隆项目

选择 **New Project** 项，可以进一步选择新建不同类型的项目。点击 **Fork**，会跳转到新克隆的项目页面，旧的项目仍会保留。

### 项目设置

点击 **Project Settings** 项，会出现项目设置弹窗，包含项目重命名、引擎版本管理、快照管理等操作。

<img src="https://gw.alipayobjects.com/zos/OasisHub/9cb6b514-2191-40b9-a904-5f5ad79aca73/image-20240319100534596.png" alt="image-20240319100534596" style="zoom:50%;" />

#### 基础设置

**Basic** 中包含项目的基础信息设置：

- **Engine Version**：引擎版本升级，以便快速修复某个 bug 或享受新的功能（注意：引擎版本升级操作是不可逆的。为避免损坏项目，升级引擎过程中会自动克隆一个项目）。
- **Physics Backend**：物理引擎后端，可以选择 _Physics Lite_ 或 _PhysX_ 两种后端。前者是一个轻量级的物理引擎，后者是基于 [PhysX](https://developer.nvidia.com/physx-sdk) 的高级物理引擎。
- **Model Import Options**：模型导入选项，包含计算切线、移除灯光的选项。

#### 快照管理

**Snapshorts** 快照管理功能允许用户保存某个项目的快照到历史记录中，万一项目出现数据丢失等问题，可以通过 **Revet** 快速恢复到之前保存的某个快照。用户可以在菜单中选择 **Add Snapshot** 。点击快照名可以编辑快照名称，以方便下次快速找到。

<img src="https://gw.alipayobjects.com/zos/OasisHub/adbd922a-f764-4e54-a7e8-891ebd18a074/image-20240319101033970.png" alt="image-20240319101033970" style="zoom:50%;" />
