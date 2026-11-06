# Terrain

## Usage Guide

Choose a semantic landform before creating or updating it. terrain.patch changes local ground height without creating an independent asset. Query existing assets through `../object-management/README.md` and resolve placement through `../spatial/README.md`. Do not assume arbitrary flattening or cross-system transactions are supported.

## API Reference Index

<!-- API_INDEX: generated from executable contracts at load time. -->

Procedural landform `elevationDelta` is a shape amplitude in metres relative to the pre-edit terrain, not measured peak uplift or absolute altitude. Asymmetry, roughness, erosion and grid sampling can reduce the measured peak. Readback of the authored parameter only verifies the amplitude; use terrain height samples to verify actual geometry, and do not report amplitude as measured height. Existing saved amplitudes retain their original geometry semantics.
