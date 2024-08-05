---
order: 4
title: Version and Performance
type: Graphics
group: Spine
label: Graphics/2D/Spine/other
---

### Spine Version
@galacen/engine-spine has supported spine 4.x versions since version 1.2.<br>
From version 1.2 onwards, the major version and minor version of the @galacen/engine-spine package correspond exactly to the spine version, as follows:<br>
- @galacean/engine-spine <= 1.2 corresponds to spine version 3.8
- @galacean/engine-spine  4.0 corresponds to spine version 4.0
- @galacean/engine-spine  4.1 corresponds to spine version 4.1
- @galacean/engine-spine  4.2 corresponds to spine version 4.2
- .....

Currently, the 4.2 beta version has been released, and versions 4.1 and 4.0 will be released gradually.

### Version Upgrade
After upgrading to editor version 1.3, besides upgrading the engine version in the editor's [project settings](/en/docs/interface/menu/#项目设置), since the exported JSON or binary Spine editor version needs to [stay consistent](https://zh.esotericsoftware.com/spine-versioning#%E5%90%8C%E6%AD%A5%E7%89%88%E6%9C%AC) with the runtime version, after upgrading the editor to 1.3, `you also need to re-export the Spine assets of version 4.2 and upload them to the editor, completing the asset update by file overwrite`.

### Performance Suggestions
Here are some methods to optimize spine animation performance:

1. Export the skeleton in binary file (.skel) format, as binary files are smaller and load faster.
2. It is recommended to pack attachments into as few atlas pages as possible, and group attachments into atlas pages according to the drawing order to prevent unnecessary material switching. Please refer to: [Spine Texture Packer: Folder Structure](https://zh.esotericsoftware.com/spine-texture-packer#%E6%96%87%E4%BB%B6%E5%A4%B9%E7%BB%93%E6%9E%84) to learn how to arrange atlas regions in your Spine atlas.
3. Use the clipping feature sparingly. Spine's clipping implementation is done through dynamic triangle clipping, which is very performance-intensive.
4. Minimize the use of atlas page textures. That is, try to control the number of textures exported to one.

### Questions
For any questions about Spine, feel free to [create an issue](https://github.com/galacean/engine-spine/issues/new) on @galacean/engine-spine.
