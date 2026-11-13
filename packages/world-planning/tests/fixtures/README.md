# Editor seed42 external field

Captured from Editor terrain generate.ts createTerrainField({seed:42, reliefAmplitudeMetres:24}). World size is 1024 m, source field is 257 by 257 nodes at 4 m spacing. Coordinates are 0..1024, before the Editor centre translation. Height range is -32..128 m. editor-seed42-field.f32 stores little-endian Float32 source node heights in Z-major row order. Interpolate bilinearly as the Editor does. editor-seed42-land.json contains the corresponding mainland and offshore island polygons.

The fixture reproduces Lake site selection against terrain before versus after River bank grading. The test quantizes final heights once to RG16 and uses native fixed a--d triangle sampling for the one-metre accepted bed. It separately reports float shoreline error and decoded/interpolated shoreline error.
