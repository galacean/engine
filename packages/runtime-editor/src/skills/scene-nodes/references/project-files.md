# 项目文件

读 project.json 找到活动 Scene 和资产表。read 工具按准确的 virtualPath 暴露项目文件，二进制文件返回描述信息。glob 工具查找路径。读同名 `.meta` 文件获取摘要。

glob、read、资产操作和 `{$ref: path}` 使用同一个 virtualPath。不要添加或去掉 `assets/` 前缀。

本宿主提供预置组件和普通 Script 资产。

## 文档与 .meta

项目自己的 README、`.d.ts` 和资产 `.meta` 是文档，不是 Engine 资产。

- 用外部 write 和 edit 工具创建或修改文本，用 read 查看已提交内容。
- 每次修改独立提交，使用规范的项目虚拟路径，并参与项目保存和撤销。
- 只有注册资产有 `.meta`。内容是 JSON，含 summary 和可选的 usage。对应资产必须已存在。
- project.json、文件夹和普通文档没有 `.meta`。
- 修改项目自己已有的 `.d.ts` 后，提交之后的 execute 会使用更新后的 API。

## 受管目录

`skills/` 和 `declare/` 是受管的只读目录，不能修改。`.ai/` 保存会话内的产物，不是项目数据。
