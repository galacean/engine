---
name: vegetation
description: 创建、移动或调整树木、灌木、草和花时使用。
---

# Vegetation

## Usage Guide

Choose an operation from the available API index:

- Create plants: use `vegetation.create`. Match the requested count and scope.
- Move an authored plant: use `vegetation.update` with `patch.target`. Use the [placement guide](skills/spatial/SKILL.md) to specify the destination.
- Change a tree's appearance: read its current values and shared effect through `world.inspect`. Use the shared appearance operation in `vegetation.update`. This operation can affect other trees with the same effect.
- Change regional vegetation or planning parameters: use [规划参数](skills/world-objects/parameters/SKILL.md).
- Find or delete plants: use the [object guide](skills/world-objects/SKILL.md).

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

## 区域植被与规划参数

使用[规划参数](skills/world-objects/parameters/SKILL.md)。Do not change a global species parameter for a single-plant request. `world.query` returns published native trees and flower regions, with `proceduralAssetId` and/or `planningEntityId` linking them to their parameter owners. Understory instances are streamed derived output, not separately authored objects. Edit their regional ecology/flower parameters. Camera residency is never the saved population.

## API Reference Index

<!-- API_INDEX: generated from executable contracts at load time. -->

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->
