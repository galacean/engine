# Object Query and Management

## Usage Guide

Use the current API Reference Index to choose this host's object model. With component authoring, discover authoring entities through world.parameters.query and read their component values through world.parameters.inspect; use schema scopes and actual returned kinds, IDs and components instead of guessing an Asset Ref. Keep nextOffset when paginated, narrow by component/kind, and return only the IDs and fields needed for the next decision.

When the asset APIs are exposed, find their world assets with `tools.world.query` and read full state with `tools.world.inspect`. Query results carry identity in `item.ref` (`ref.id`, `ref.kind`, `ref.domain`, `ref.source`); read type-specific fields from their declarations. Use tags and named selections only when those APIs are listed. System components may own their own query interfaces; use the corresponding system guide to discover objects managed by those components.

Deletion and undo follow each capability's contract. `editor.history.query({})` lists undoable and redoable asset transactions, next actionable entry first. Pass an ordered contiguous list of IDs to `editor.history.undo` or `editor.history.redo` in a standalone execute. This restores author assets, not elapsed simulation or independently committed gameplay commands. New edits clear redo. History is session-scoped.

Ownership and spatial containment are different relationships. A parent reference identifies an owner; `relatedTo.relation: "inside"` tests geometric containment. Reuse returned refs and follow nextOffset when paginated.

## API Reference Index

<!-- API_INDEX: generated from executable contracts at load time. -->
