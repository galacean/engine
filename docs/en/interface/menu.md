---
order: 1
title: Main Menu
type: Basic Knowledge
group: Interface
label: Basics/Interface
---

Project management includes operations such as creating a new project, cloning a project, and project settings.

<img src="https://gw.alipayobjects.com/zos/OasisHub/b680ec2d-0766-48d1-b8ae-67c5bc2dcf3e/image-20240319100341232.png" alt="image-20240319100341232" style="zoom:50%;" />

### Create/Clone Project

Select the **New Project** option to further choose different types of projects to create. Clicking **Fork** will redirect you to the newly cloned project page, while the old project will still be retained.

### Project Settings

Click on the **Project Settings** option to bring up a project settings popup, which includes operations such as project renaming, engine version management, and snapshot management.

<img src="https://gw.alipayobjects.com/zos/OasisHub/9cb6b514-2191-40b9-a904-5f5ad79aca73/image-20240319100534596.png" alt="image-20240319100534596" style="zoom:50%;" />

#### Basic Settings

**Basic** contains settings for the project's basic information:

- **Engine Version**: Upgrade the engine version to quickly fix a bug or enjoy new features (Note: Engine version upgrade is irreversible. To avoid damaging the project, a new project will be automatically cloned during the engine upgrade process).
- **Physics Backend**: Choose between *Physics Lite* or *PhysX* as the physics engine backend. The former is a lightweight physics engine, while the latter is an advanced physics engine based on [PhysX](https://developer.nvidia.com/physx-sdk).
- **Model Import Options**: Model import options include options for calculating tangents and removing lights.

#### Snapshot Management

The **Snapshots** feature allows users to save snapshots of a project in the history records. In case of data loss or other issues with the project, users can quickly restore to a previously saved snapshot using **Revert**. Users can select **Add Snapshot** in the menu. Clicking on the snapshot name allows editing the snapshot name for easy reference in the future.

<img src="https://gw.alipayobjects.com/zos/OasisHub/adbd922a-f764-4e54-a7e8-891ebd18a074/image-20240319101033970.png" alt="image-20240319101033970" style="zoom:50%;" />
