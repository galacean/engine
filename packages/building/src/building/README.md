# Geometry × Rule × Unit in Seed World

The public entry is `parts/architecture/index.ts`, exported through `parts/index.ts`.
`Building.European.*` writes core drafts; `BuildingManager` designs them with the core
(`core/`, part types in `partTypes/`) and draws them through `render/CoreBuilding.ts`. See
[parts/README.md](parts/README.md) for the flow and API, [core/README.md](core/README.md) for
the core, and [components/README.md](components/README.md) for the editing and save boundaries.
Seed World uses the v8-groups save key and only loads that version.

This is the admitted round/rectangular-house + Gothic example domain, not a claim
that every Tiny Glade feature has been ported.
