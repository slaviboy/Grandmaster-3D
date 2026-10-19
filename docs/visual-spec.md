# Visual specification

Grandmaster 3D recreates the look of a classic 2000s desktop 3D chess game: a wooden board on a
blue cloth, turned-wood Staunton pieces and translucent teal panels. The reference screenshots live
in `docs/reference/` on the developer's machine only. They are gitignored and never published, and
nothing in them is copied. Every model, texture and icon here is made from scratch. Colours below
were sampled from the main reference (587×440); proportions are starting values that Phase 8 refines
by measured comparison.

## Scene

| Element | Specification |
|---|---|
| Background | Dark blue-teal cloth `#154458` with a fine, wavy wood-grain-like streak pattern running horizontally |
| Board frame | Orange maple `#E0A15D`. It is wide (≈0.55 of a square on each side), with rounded outer corners, a visible front edge about 0.2 of a square thick, and a soft drop shadow on the cloth |
| Coordinates | A–H along the near edge and 1–8 along the left edge, engraved in pale cream (lighter than the frame), in a clean sans-serif |
| Squares | Light maple `#F4C38D` and tan `#B78249`, low contrast, with fine straight grain. The playing area sits slightly below the frame top |
| Pieces | Classic Staunton in turned wood, semi-gloss. Growth rings show on the tops (seen clearly from overhead), and grain runs along each piece. White is pale boxwood cream; black is a mid-to-dark rosewood brown with visible grain (not ebony black) |
| Piece forms | King: crown with a cross finial. Queen: coronet with points and a ball. Bishop: miter with a slit and a small ball. Knight: carved horse head with mane. Rook: tower with crenellations. Pawn: ball on a collar. All are tall and slim with wide bases |
| Camera | Default view is from White's side at ≈45–50° elevation with moderate perspective (the far edge is ≈0.75× the near edge). The board sits left of the right-hand panel. The view can be rotated, tilted, panned and zoomed |
| Light | Key light from the front right and above, casting soft shadows toward the back left; soft fill light; mild highlights on the pieces |
| Last move | Thin white rings on the from- and to-squares |
| Selection | The selected square is tinted a light blue (≈`#5BA9C8`) |

## Interface

| Element | Specification |
|---|---|
| Title bar | `#105876` with the wordmark top left and `_ □ X` buttons top right |
| Menu | File · Edit · Game · Actions · Mentor · Preferences · Windows · Help, with underlined accelerator letters, in light text on the bar |
| Panels | Body `#105876`, slightly translucent; header `#397C96`; 1px light-blue border; white Tahoma/Verdana-style text; ▴ (collapse) and X in the header |
| Chess Coach (left) | Collapsed header by default. Expanded, it holds sections (Moves, Pieces, Board, Show Hints) with checkboxes and radio buttons, plus coach messages |
| Game Status (right) | Two player cards, each with a portrait, a king icon in the player's colour, "Name (rating)", a large thin clock (the active side's clock is boxed in white) and "10 Min/Game". Between them a move list with ⏮ ◀ ⏸ ▶ ⏭ buttons. Portraits are original silhouettes |
| Captured Pieces | Two rows, Q R B N P, with a count under each piece type that has been captured |
| Bottom left | ▲ tab with a pawn-pair turn indicator, and a ▶ that slides out round action buttons |
| Bottom right | A rounded strip of round icon buttons |
| Status line | One line of text along the bottom edge, such as "Black is checkmated" |
| Dialogs | Dark panels with a header bar and full-width rounded buttons |
