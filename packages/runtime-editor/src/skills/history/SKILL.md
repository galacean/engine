---
name: history
description: 撤销或重做之前的编辑时使用。
---

# 撤销与重做

Undo and redo are editor.history operations across all author assets, including Scene, Prefab, Material and configured world settings. For a request to undo an earlier edit, query editor.history.query and use transaction IDs; writing guessed old values is a new edit, not undo. One execute is one transaction.

1. Query {direction:"undo"|"redo",limit?,cursor?}; the bounded result is {items,total,revision,nextCursor}. Default direction is undo. Follow nextCursor with the same direction; changed results reject stale cursors.
2. Choose a contiguous prefix of items in its listed order. history.read({transactionId}) returns complete paths and runtime errors.
3. Submit the entire chosen batch once, in an execute containing no other edits.

No task grouping or automatic rollback occurs. Query summaries include up to three shortened paths, pathCount, pathsTruncated, runtime and errorCount. History is session-scoped; saved author assets survive reopening, the undo stack does not.

接口：[原生编辑 API](declare/editor/native/api.d.ts)
