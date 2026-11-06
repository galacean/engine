# Water authoritative data flow

Water uses one directional, data-driven publication chain. A parameter has one semantic owner; other layers may compile, cache, transport, or inspect that value, but may not independently author it.

The implementation lives in `gallery/shared/water`. Its explicit authoring, compiler, runtime, backend, preset and resource entries are documented in [README.md](README.md). Production consumers use those entries; internal modules and white-box tests may use implementation files. Worker and offline CJS/AOT tooling retain dedicated file entries, checked by `tests/architecture/WaterSharedBoundary.test.ts`.

The shared implementation does not depend on `demos`. Scene identities, registration adapters, terrain recipes, cameras and UI belong to the consuming scene. Showcase integration and controls are documented in the [Water cases](../../demos/water/README.md). Weather and depth prepasses retain their existing shared owners.

```text
WaterBodySource -> WaterBodyAsset -> WaterBodyInstance
                         |                 |
                         |        WaterLook + WaterQualityPlan
                         |                 |
                         +----> ResolvedWaterBodyInstance
                                      |
                  +-------------------+-------------------+
                  |                                       |
          PhysicalSurface                         RenderContract
                  |                                       |
          CompiledResource                                |
                  +-------------------+-------------------+
                                      |
                  EnvironmentSnapshot + RuntimeAvailability
                                      |
                              EffectiveSnapshot
                                      |
                                   Backend
                                      |
                                RuntimeHost commit
                                      |
                   Query / Surface / Spatial / Interaction
```

## Water naming convention

- **Lake（湖泊）** means a bounded water region with a planar reference surface, including ponds, reservoirs and the former Grasslands bay showcase. Its semantic `WaterBodyAsset.kind` is `lake`, regardless of the region shape or decorative ripples.
- **River（河流）** uses the reusable `createRiver` centerline entry and `stylized-river-look-v1` in its demo. Existing network authoring remains supported. See [River sampling](authoring/river/RiverSampling.md) for the source/profile/rendering boundary.
- **Ocean（海洋）** retains its world-space Ocean representation and Look.
- Lake shorelines use the [closed-spline authoring/compiler](authoring/lake/README.md): XZ boundary rings plus one horizontal base water level; bathymetry and optional waves remain independent. Generated Lake adapters derive their rings from existing authoritative coverage.
- `heightfield` describes the Lake backend/grid representation. It is not a water category or a Look name; compiler, shader and representation identifiers remain technical implementation names.
- Gallery Lake (High), Integrated World and SeedWorld Lake register the same `lake-water-look-v1` through `registerLakeWaterLook`. The local Low/Medium variants are named `lake-low-water-look-v1` and `lake-medium-water-look-v1`. Each scene still owns its boundary, bathymetry and quality budget.
- Gallery exposes separate `#water/lake`, `#water/river` and `#water/ocean` menus. Lake and River select separate runtimes through the shared Water HTML shell. Existing Water scene links remain accepted.

## Model boundaries

| Model | Owns | Must not own |
| --- | --- | --- |
| `WaterBodyAsset` | Stable water definition: kind, Representation route/data, authoritative Source, and independent Source/Representation revision hashes | Scene transform, visual tuning, runtime objects |
| `WaterBodyInstance` | Scene identity, Asset/Look/Quality references, transform, visibility, priority, interaction routing and explicit scene-local Representation state | Duplicated Look or Quality values |
| `WaterBodySource` | Hydrology, bathymetry, flow and physical motion facts only | Render geometry, layout, tessellation/cadence, IOR, refraction, color, reflection policy or runtime feature availability |
| `Representation` | Semantic spatial expression: Asset-owned render geometry plus Instance-owned scene-local layout/state, and the route used to select a backend | Backend implementation id, tessellation/cadence budget or Look values |
| `PhysicalSurface` | Quality-independent identity of the physical source, wave model and response policy | Presentation Look values |
| `WaterLook` | Shared visual definition: Appearance, Optics, reflection intent/sampling, foam and RenderState | Geometry/query budgets or scene-local state |
| `WaterQualityPlan` | Geometry, shading, scene-field, reflection, surface-effect availability (including caustics), query, spatial-field and backend-specific implementation/cadence budgets | Visual style, physical facts or layout |
| `RenderContract` | Deterministic compiled visual capability and resource contract | Mutable Engine resources |
| `CompiledResource` | Backend-specific immutable physical/geometry/query data plus route and physical identities | Live scene state |
| `EnvironmentSnapshot` | Change-driven scene facts used by visual resolution | Engine objects and frame clocks |
| `EffectiveSnapshot` | The only immutable semantic state consumed by an active backend renderer | Mutable simulation buffers |
| `Backend` | Specialized compile/runtime algorithm selected by Representation | Authoring policy |
| `RuntimeHost` | Serialized preparation, atomic publication, rollback, lifetime and shared-resource ownership | Water parameter authoring |
| Runtime interfaces | Read/query/interaction surfaces published after commit | Private backend controllers |
| Revision/hash | Source revision, compiled identity, optimistic concurrency, cache identity and stale/ABA rejection | A second parameter value source |

High-frequency physical simulation output, such as Ocean wind integration, is backend state derived from the PhysicalSurface model and a scene provider. It is not a second authoring source. The PhysicalSurface hash therefore includes the wind-response policy, while visual parameters remain exclusively in the shared WaterLook.

## Publication rules

1. Asset, Look, Quality and Environment drafts are validated and copied into owned immutable snapshots before preparation.
2. Preparation may allocate detached resources, but it must not mutate the active Asset registry, World routes, camera leases, backend runtime maps, or visible scene roots.
3. A RuntimeHost commit synchronously publishes every participant or restores the previous generation. Retired cleanup runs after publication and cannot roll the visible generation back.
4. Look and Environment changes stage every consumer, then publish one shared revision. DevTools writes IOR, refraction, reflection and other visual values only through the Look authoring port.
5. Backends consume `EffectiveSnapshot`; compile operations consume the resolved Asset/Instance bundle. Runtime contexts carry Engine objects only.
6. `WaterBodyAsset.sourceHash` is the authority's immutable source-revision token; `representationDataHash` independently revises Asset-owned spatial expression; backend `sourceHash` identifies the complete detached compile input; `physicalSurfaceHash` identifies the quality-independent physical surface; `compiledHash` identifies implementation output. `contentHash` covers every embedded semantic value, while revision and publication-generation tokens reject stale and ABA publications.
7. Reflection/environment resource binding revision is availability metadata, not a second semantic revision. A binding-only refresh may publish a new Effective snapshot while preserving its semantic activation revision and content hash, so optimistic Look/Environment transactions do not livelock.
8. Source-carried validation limits may only tighten trusted compiler hard limits. They cannot raise allocation ceilings or select a quality level.
9. Activation and scene facades expose generation-bound read ports, not CompiledResource/Provider owners. Diagnostic data is detached; numeric buffer borrows and dynamic upload buffers are copied before publication. Retain, release, dispose and destroy remain inside Loader/Backend ownership.
10. Frame advancement, deterministic time pins and shader debug views are transient RuntimeHost/development commands. Acceptance-only feature isolation is exposed through a named diagnostic adapter and never through the semantic scene facade; production authoring still publishes through Look, Quality, Instance, Representation or Source transactions.
11. A Source editor is an authoring-layer transaction port. It publishes a strictly decoded Source DTO and is never retained in Backend runtime context. Backend diagnostics expose detached readback and explicitly allowlisted transient commands only.
12. Backend registration is Host-scoped and lease-managed. Active bodies defer retirement, re-acquisition cancels pending retirement, and the legacy registry removal path cannot split a managed installation from its lease.
13. Compile-cache acquisition transfers a retained consumer lease before resolving its Promise. The LRU owns a separate reference; eviction cannot prevent a delivered consumer from retaining backend child resources. Disposal is requested only after both cache and consumer ownership retire. Loader destroys the backend before releasing that lease.
14. Runtime resource acquisition isolates cancelled generations. Load completion transfers all consumer leases synchronously; shutdown joins superseded loads and asynchronous retirements, then reports cleanup errors without abandoning other owners.

The current backend adapters apply those rules concretely:

- Heightfield `renderSurface` is `WaterBodyAsset.representationData`; it is not part of the GridMask physical Source.
- River curve sampling distance comes from `WaterQualityPlan`; visual bank feather is River Representation data; the Source contains topology, shape, flow and surface-motion facts.
- Ocean capability mode is derived from the effective Quality/Interaction/Look requirements. Its dynamic nearshore model remains physical Source, fixed-step cadence and seek limits are Quality budgets, and thin-film transition width is Instance-owned Representation state.

Seed World and Integrated World intentionally reference the same canonical Lake Look id and content hash. Seed World may own a different Quality Plan, because that changes implementation budget rather than visual style.
