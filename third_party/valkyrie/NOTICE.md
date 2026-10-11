# Valkyrie game content

The packing lists (`js/packlists.js`, built by `scripts/fetch-packlists.py`) use the game-content definitions of the
Valkyrie app, [github.com/NPBruce/valkyrie](https://github.com/NPBruce/valkyrie)
(`unity/Assets/StreamingAssets/content/MoM`: `content_pack.ini`, `tiles.ini`, `monsters.ini`), which is published under
the Apache License 2.0 (a copy is in `LICENSE` here).

What this site takes from them: which box each tile side and monster belongs to, which side is on the back of each tile,
and tile and monster names read from their identifiers. No images or other files are copied.

Each scenario's own file (linked from the Valkyrie scenario catalogue) is only read to list the tiles and monsters it
uses; nothing from it is published apart from that list. Tile numbers are from the community
[Mansions of Madness Tiles Index v5.2](https://boardgamegeek.com/filepage/147448/mansions-of-madness-tiles-index)
(`scripts/tiles-index-from-pdf.py`), first used in the [valkyrie-tools packlist](https://github.com/maniac782/valkyrie-tools/tree/main/packlist).
