# Seed World Knowledge

Choose the relevant system below and read its README before using unfamiliar capabilities. Each README contains a Usage Guide and an API Reference Index. Read only the declarations needed for the next action. Published document links use project-root paths and can be passed directly to read. Reuse already read information during the task.

Only the API links in the current indexes declare this host's callable capabilities. Domain guides describe the broader system; an API mentioned in their background but absent from the current index is unavailable here. Follow exact declaration links instead of inventing file paths or repeatedly reading unavailable APIs.

In execute, these world APIs live under `tools`, for example `await tools.world.parameters.query(...)`. Component extensions use `await editor.component.query(...)` and the methods declared on the returned proxy. Read the linked declarations for exact input and output fields.

When the scene exposes component authoring, the relevant guides include system-owned component usage knowledge for the available components. Discover exact fields, units, scope and constraints through `world.parameters.describe`, then inspect the actual target before proposing edits. System guides explain how capabilities relate; they do not supply fixed mood presets or override the current schema, authorization or runtime checks.

- [Object Query and Management](object-management/README.md)
- [Space and Placement](spatial/README.md)
- [Time and Seasons](time/README.md)
- [Atmosphere](atmosphere/README.md)
- [Terrain](terrain/README.md)
- [Water](water/README.md)
- [Vegetation](vegetation/README.md)
- [Animals](animals/README.md)
