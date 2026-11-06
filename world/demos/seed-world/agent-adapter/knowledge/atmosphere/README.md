# Atmosphere

## Usage Guide

Read atmosphere state when necessary. Change only requested channels: sky color, wind, rain, snow, lightning, cloud and fog. Use `../time/README.md` for time and season.

## API Reference Index

<!-- API_INDEX: generated from executable contracts at load time. -->

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->

Wind direction is the world horizontal heading the air blows toward: 0° is -Z, +90° is +X, -90° is -X. It is not the direction the wind comes from or an offset from the wind entity. The update receipt contains the draft target; after commit, `tools.atmosphere.get()` reports the current physical direction, which can differ during a transition. At zero wind speed the retained last direction does not mean wind is still blowing.
