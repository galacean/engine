---
name: assets-inspect
description: 需要了解项目资产的类型、说明或内容时使用。
---

# 查看项目资产

先用 `editor.asset.info({path})` 查看类型和已填写的说明，这一步不下载完整资产。需要了解内容时用 `editor.asset.read({path})`：

| 资产 | 返回 |
| --- | --- |
| 脚本文本 | `kind: "text"` |
| JSON 等结构 | `kind: "structured"` |
| PNG/JPEG | `kind: "image"`，含尺寸和格式 |
| GLB | `kind: "model"`，含场景、节点、网格、材质和静态模型局部包围盒 |

读取模型不会告诉你场景实例的世界坐标。查询实例用 Entity 和 Component 接口。其他编码会明确报不支持，可以用 VFS 的 read 查看原始文本或二进制描述。

只有注册资产有同名 `.meta`。项目清单、文件夹、README 和声明不生成 `.meta`。未填写的资产 summary 和 usage 为空。
