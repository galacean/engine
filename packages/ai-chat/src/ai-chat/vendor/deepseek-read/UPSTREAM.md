# DeepSeek Harness read adaptation

Source: https://github.com/deepseek-ai/deepseek-harness
Revision: 687f282e8625c6b8d11ff58211a90524be2e4317
License: MIT (retained in LICENSE)

Adapted from:
- packages/fs/tool-fs/src/read.ts: parseReadArgs, offset/limit semantics.
- packages/fs/tool-fs/src/read-render.ts: buildWindow, chunk/line scanning,
  bounded line buffer, CRLF handling, total line counting and EOF validation.
- packages/fs/tool-fs/tests/read-render.spec.ts: windowing test cases, ported
  into ../../tests/agent-read-window.spec.ts.

Necessary differences:
- Browser VFS supplies decoded text; no Cordis, native disk access or UI plugin.
- Whole rendered lines are paged by 1-based line offset. A row that does not
  fit is deferred intact to the next page; intrinsically long lines are explicitly
  truncated at 2000 UTF-16 units, without splitting surrogate pairs.
  This follows upstream read-render behavior (also verified at
  f3803c96974ad4a94195fb97e5c637e9c2a3afe3); there is no column parameter.
- JSON-encoded line records (including escaping) count toward the byte budget.
  The VFS adapter uses 16 KiB per window and a 32 KiB result-envelope ceiling.
- Typed FsError is replaced with the host's existing paired Tool error boundary.

Knowledge caching, model transport, token estimation and compaction are not
part of this port. The latter two remain owned by ASAP.
