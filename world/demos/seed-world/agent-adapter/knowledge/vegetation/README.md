# Vegetation

## Usage Guide

Choose individual plants or a distribution matching the user's requested count and scope. Tree appearance changes can affect a shared procedural variation; inspect the scope before editing. Use `../object-management/README.md` for finding and deleting existing plants, and `../spatial/README.md` for placement.

## Reusing a queried plant reference

`world.query` returns a heterogeneous Asset projection, even when a filter asks for one kind. It has `type`, `ref`, optional `position`, `bounds`, `tags` and `relations`; do not assume it has `name` or detailed `properties`. Read details with `world.inspect` when needed.

For an authored plant edit, keep the returned reference, narrow its kind and source, then pass it directly. A query filter is a runtime selector, not a TypeScript type assertion. A standalone object literal assigned to a variable can widen its strings; reusing the returned reference avoids rebuilding its identity or casting away checks.

```javascript
const result = await tools.world.query({ kinds: ["tree"], sources: ["authored"], limit: 1 });
const item = result.items[0];
if (!item) throw new Error("No matching tree");
const ref = item.ref;
if (ref.kind !== "tree" || ref.source !== "authored") throw new Error("Expected an authored tree");
await tools.vegetation.update({ ref, patch: { seed: 123 } });
```

This example updates a seed; for a position edit, provide only `patch.target`. Natural trees support the separately declared shared appearance operation, not authored position/seed edits. Do not increase retry limits or use `any` to bypass these boundaries.

## Planning component authoring

When `world.parameters.describe` is available, this scene uses component authoring. Discover the relevant component from its public metadata, query eligible entities when the target is unknown, then inspect the target to obtain effective values and `versionToken`. Submit one atomic `world.parameters.apply` batch using that token. `set`, `reset`, and `base` are the same operations used by the Inspector. Scope, units, field rules and material part semantics come from the component metadata; do not invent field names or change a global species parameter for a single-plant request.

Parameter reads are paginated within the Agent result budget. `componentTypes` lists the complete component index, while `components` contains only the current page of fields. Narrow `describe` with `component` and `search`; narrow `inspect` with `component` and exact `fields`. Follow `nextOffset` with the same filters when more fields or entities are needed. `matchedCount` is the total matching fields for describe/inspect, or entities for query. A field absent from one page is not evidence that it is unset. Return only the relevant summary from an execute script.

`world.query` returns published native trees and flower regions, with `proceduralAssetId` and/or `planningEntityId` linking them to their parameter owners. Understory instances are streamed derived output, not separately authored objects. Edit their regional ecology/flower parameters. Camera residency is never the saved population. Use the available API index to determine whether `vegetation.create/update` is exposed. When exposed, these APIs create or edit authored vegetation separately from the planning components; their contracts define the allowed operations.

An accepted parameter receipt waits for publication and persistence; it is not visual acceptance. Reinspect after a conflict. Scene v2 stores only author components, and definitions load as ResourceManager JSON assets. Generated geometry is rebuilt after loading.

`apply` returns diagnostic counts and a `receiptId`. Read detailed checks or changed IDs through `world.parameters.receipt` before the next edit, using pagination as needed. An accepted transaction may still have failed or unknown planning checks; inspect the diagnostic summary before claiming the user's intent is satisfied. Never repeat an edit merely to retrieve its receipt.

## API Reference Index

<!-- API_INDEX: generated from executable contracts at load time. -->

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->
