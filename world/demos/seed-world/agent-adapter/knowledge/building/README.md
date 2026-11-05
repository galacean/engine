# Building Authoring

## Usage Guide

Use `tools.building.generate` to obtain Prefab Source from the current European building generators. This operation returns author data; it does not create scene objects or render a building. In a native editing session, save the returned content with `editor.asset.create`, then instantiate it with `editor.entity.create` in the same transaction. Read the generated contract for exact parameters and return fields.

Existing buildings use independent `BuildingGroupComponent` and `BuildingPartComponent` authors. Inspect and edit their native Source through Editor APIs. Preserve the target instance's frame and references; generated meshes are runtime output and must not be saved as a second author definition. After committing, inspect the scene BuildingManager's buildStatus for completion or errors.

## API Reference Index

<!-- API_INDEX: generated from executable contracts at load time. -->
