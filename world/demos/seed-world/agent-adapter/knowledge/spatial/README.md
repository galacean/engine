# Space and Placement

## Usage Guide

Resolve relative directions through spatial.resolve; do not guess coordinates. Use spatial.check for a bounded check of exact positions (up to 32); it returns matches and failedConstraints for each point. Use spatial.search only to find candidates when the user asks for terrain conditions. nearest is a ranking anchor, not an exact sample. A finite search with no_match is finished, not proof that the entire continuous world is unsuitable. Do not loop to invent stricter requirements or replace a completed check with another search. spatial.teleport moves the player to a spatial target; subjectView frames a published subject through world parameters as described below. Heading 0 faces -Z, 90 faces +X. Placement constraints belong inside target. Read `../object-management/README.md` to locate an existing anchor.

## API Reference Index

<!-- COMPONENT_KNOWLEDGE: provided by registered systems at load time. -->

<!-- API_INDEX: generated from executable contracts at load time. -->
