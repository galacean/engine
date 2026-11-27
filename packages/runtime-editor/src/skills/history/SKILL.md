---
name: history
description: 撤销或重做之前的编辑时使用。
---

# 撤销与重做

撤销和重做是 `editor.history` 的操作，覆盖所有作者资产，包括 Scene、Prefab、Material 和已配置的世界设置。要撤销之前的编辑，先查询 `editor.history.query`，再使用事务 ID。写入猜测的旧值是一次新编辑，不是撤销。一次 execute 是一个事务。

1. 查询 `{direction:"undo"|"redo",limit?,cursor?}`，返回有界结果 `{items,total,revision,nextCursor}`。默认方向是 undo，不会同时列出重做记录。按 nextCursor 继续时使用相同方向。结果变化后，旧 cursor 会被拒绝。
2. 从 items 开头起选择连续的一段，保持列出的顺序。仅当摘要不足以判断该撤销哪一条时才调 `history.read({transactionId})` 查看完整路径和运行错误。
3. 调用 `editor.history.undo({transactionIds})` 或 `editor.history.redo({transactionIds})`，一次提交整批。这个 execute 中不能有其他编辑，但**可以把 `history.query` 和 `history.undo` 放在同一次 `execute` 中完成**（如撤销最近一次修改时直接取 `items[0].transactionId` 并 `undo`，提交成功即已完成，无需再多跑一轮 `history.query` 复查）。

不会自动按任务分组，也不会自动回滚。查询摘要最多包含 3 个缩短路径，还有 pathCount、pathsTruncated、runtime 和 errorCount。

历史只在当前会话有效。已保存的作者资产在重新打开后仍在，撤销栈不会保留。

撤销只恢复作者资产，不恢复已流逝的模拟时间，也不恢复独立提交的玩法命令。新的编辑会清空重做记录。

接口：[原生编辑 API](declare/editor/native/api.d.ts)
