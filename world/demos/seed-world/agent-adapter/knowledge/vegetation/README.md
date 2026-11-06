# Vegetation

## Usage Guide

Choose an operation from the available API index:

- Create plants: use `vegetation.create`. Match the requested count and scope.
- Move an authored plant: use `vegetation.update` with `patch.target`. Use the [placement guide](../spatial/README.md) to specify the destination.
- Change a tree's appearance: read its current values and shared effect through `world.inspect`. Use the shared appearance operation in `vegetation.update`. This operation can affect other trees with the same effect.
- Change regional vegetation or planning parameters: use the component workflow below.
- Find or delete plants: use the [object guide](../object-management/README.md).

## Choose the reference

If history identifies the intended plant, reuse its `assetRef` from create/update. You can also reuse a query result's `ref`.
If you need current details, call `world.inspect` with that reference. If the identity is unclear, use `world.query` to find it.

`world.query` returns an Asset projection with `type`, `ref`, and optional `position`, `bounds`, `tags`, and `relations`.
Read detailed properties with `world.inspect`. Query results do not guarantee a `name` field.
Check `ref.kind` and `ref.source` before an operation that requires a particular kind or source.
A query filter selects runtime results but does not narrow the declaration's union type.
Preserve the returned reference instead of constructing a variable with widened string fields or using a type assertion.

Position and seed edits require authored vegetation. Natural trees support the declared shared appearance operation instead.
Changing retry limits or using `any` does not change this boundary.

## Check the result

Return the update fields needed to assess the request, including `resolvedEffect` when it supplies the actual destination.
Use the update result and final execute receipt to assess completion.
Query the same `assetRef` if necessary evidence is missing or conflicts with the requested result.
An object's absence from the current view does not prove that the update failed.

## Planning component authoring

When `world.parameters.describe` is available, this scene uses component authoring. Discover the relevant component from its public metadata, query eligible entities when the target is unknown, then inspect the target to obtain effective values and `versionToken`. Submit one atomic `world.parameters.apply` batch using that token. `set`, `reset`, and `base` are the same operations used by the Inspector. Scope, units, field rules and material part semantics come from the component metadata; do not invent field names or change a global species parameter for a single-plant request.

Parameter reads are paginated within the Agent result budget. `componentTypes` lists the complete component index, while `components` contains only the current page of fields. Narrow `describe` with `component` and `search`; narrow `inspect` with `component` and exact `fields`. Follow `nextOffset` with the same filters when more fields or entities are needed. `matchedCount` is the total matching fields for describe/inspect, or entities for query. A field absent from one page is not evidence that it is unset. Return only the relevant summary from an execute script.

`world.query` returns published native trees and flower regions, with `proceduralAssetId` and/or `planningEntityId` linking them to their parameter owners. Understory instances are streamed derived output, not separately authored objects. Edit their regional ecology/flower parameters. Camera residency is never the saved population. Use the available API index to determine whether `vegetation.create/update` is exposed. When exposed, these APIs create or edit authored vegetation separately from the planning components; their contracts define the allowed operations.

An accepted parameter receipt waits for publication and persistence; it is not visual acceptance. Reinspect after a conflict. Scene v2 stores only author components, and definitions load as ResourceManager JSON assets. Generated geometry is rebuilt after loading.

`apply` returns diagnostic counts and a `receiptId`. Read detailed checks or changed IDs through `world.parameters.receipt` before the next edit, using pagination as needed. An accepted transaction may still have failed or unknown planning checks; inspect the diagnostic summary before claiming the user's intent is satisfied. Never repeat an edit merely to retrieve its receipt.

## API Reference Index

<!-- API_INDEX: generated from executable contracts at load time. -->

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->
