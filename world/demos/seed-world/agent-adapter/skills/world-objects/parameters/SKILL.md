---
name: world-objects-parameters
description: 查询或修改规划组件参数（world.parameters）时使用，如区域植被、天气、光照和动物种群。
---

# 规划参数

When `world.parameters.describe` is available, this scene uses component authoring. Discover the relevant component from its public metadata, query eligible entities when the target is unknown, then inspect the target to obtain effective values and `versionToken`. Submit one atomic `world.parameters.apply` batch using that token. `set`, `reset`, and `base` are the same operations used by the Inspector. Scope, units, field rules and material part semantics come from the component metadata; do not invent field names.

Parameter reads are paginated within the Agent result budget. `componentTypes` lists the complete component index, while `components` contains only the current page of fields. Narrow `describe` with `component` and `search`; narrow `inspect` with `component` and exact `fields`. Follow `nextOffset` with the same filters when more fields or entities are needed. `matchedCount` is the total matching fields for describe/inspect, or entities for query. A field absent from one page is not evidence that it is unset. Return only the relevant summary from an execute script.

Use the available API index to determine whether `vegetation.create/update` is exposed. When exposed, these APIs create or edit authored vegetation separately from the planning components; their contracts define the allowed operations.

An accepted parameter receipt waits for publication and persistence; it is not visual acceptance. Reinspect after a conflict. Scene v2 stores only author components, and definitions load as ResourceManager JSON assets. Generated geometry is rebuilt after loading.

`apply` returns diagnostic counts and a `receiptId`. Read detailed checks or changed IDs through `world.parameters.receipt` before the next edit, using pagination as needed. An accepted transaction may still have failed or unknown planning checks; inspect the diagnostic summary before claiming the user's intent is satisfied. Never repeat an edit merely to retrieve its receipt.
