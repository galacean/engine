# Contour inputs

`C01.json` through `C05.json` contain the measured contours consumed by
`build-utils.mjs` and `build-C01.mjs` through `build-C05.mjs`. They are source
inputs for regenerating the study definitions in `../data/`, not test reports.

Historical screenshots and generated reports have been removed. Each input
retains its source image hash, dimensions and extraction metadata. The original
images remain traceable through Git history; they are not runtime dependencies.
