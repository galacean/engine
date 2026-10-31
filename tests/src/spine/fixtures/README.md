These fixtures are original synthetic skeletons and 4x4 solid-color textures, without third-party artwork.

- `3.8` / `4.2`: one bone and slot, two skins on different atlas pages, and one translation animation. Slot `slot` deliberately differs from attachment `quad`, to catch incorrect texture enumeration.
- `.skel`: minimal binaries with each version's hash header, zero bounds/reference scale, and zero counts for all collections. They exercise actual native binary parsers, not only header detection.
- `sequence`: a 4.2 attachment with two sequence frames on separate pages.
- `physics`: a 4.2 skeleton with one physics constraint.
- `whitespace`: a JSON skeleton preceded by a BOM and whitespace.
