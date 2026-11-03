# Water

## Usage Guide

Create ponds, lakes, streams or rivers with water.create. Read the target asset and its supported parameters before updating it. Creation includes the required basin or riverbed. Respect minimum water levels when draining. See `../spatial/README.md` for placement.

Ponds and lakes take their water level from the ground at the requested center and only cut the basin downward. Surrounding terrain must enclose that level; the operation does not raise a dam or lower the requested level to hide a downhill leak. An open-shoreline error during edit preparation rejects the transaction. Report the location constraint; changing a seed does not resolve an open downhill basin. Only reshape terrain or change the location when consistent with the user's intent. A preview estimates impact and does not validate shoreline closure; check the execute receipt for the committed result.

## API Reference Index

<!-- API_INDEX: generated from executable contracts at load time. -->
