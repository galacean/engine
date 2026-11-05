# 项目文件

Read project.json to find the active Scene and asset table. The read tool exposes project files at their exact virtualPath; binary files return descriptors. The glob tool finds paths; read sibling .meta files for summaries. Use the same virtualPath in glob/read, asset operations and {$ref: path}. Never add or strip an assets/ prefix.

This host provides preset components and ordinary Script assets.

Project-authored README, .d.ts and asset .meta files are documents, not Engine assets. Use the external write/edit tools to create/update their text and read to inspect committed content. Each mutation commits independently using a canonical project virtual path and participates in project save/undo. Only registered assets have .meta sidecars. Metadata is JSON with summary and optional usage strings; its asset must already exist. project.json, folders and ordinary documents have no .meta. skills/ and declare/ are managed read-only knowledge. .ai/ contains session-only artifacts, never project data. Updating an existing declaration changes the APIs available to subsequent Agent executions after commit.
