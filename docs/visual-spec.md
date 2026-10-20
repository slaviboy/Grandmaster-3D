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
| Board frame | Orange maple `#E0A15D`. It is 0.5 of a square wide on each side, with rounded outer corners and a rounded top edge. The front edge is 0.45 of a square thick, light at the top and darkening toward the cloth, and the board casts a soft drop shadow on the cloth |
| Coordinates | A–H along the near edge and 1–8 along the left edge, engraved in pale cream (lighter than the frame), in a clean sans-serif |
| Squares | Light maple `#F4C38D` and tan `#B78249`, low contrast, with fine straight grain. The playing area sits slightly below the frame top |
| Pieces | Classic Staunton in turned wood, semi-gloss. Growth rings show on the tops (seen clearly from overhead), and grain runs along each piece. White is pale boxwood cream; black is a mid-to-dark rosewood brown with visible grain (not ebony black) |
| Piece sizes | Measured heights in squares: king 1.745, queen 1.63, bishop 1.36, knight 1.30, rook 0.93, pawn 0.83. Bases are about 0.5 (pawn) to 0.6 (king) of a square across. Knights face the a-file side, and bishop slits face right as seen from White |
| Piece forms | King: crown with a cross finial. Queen: coronet with points and a ball. Bishop: miter with a slit and a small ball. Knight: carved horse head with mane. Rook: tower with crenellations. Pawn: ball on a collar. All are tall and slim with wide bases |
| Camera | Default view fitted to the reference within 0.8 px: from White's side at 49.7° elevation, vertical field of view 30.5°, 22 squares away, with the principal point shifted 4% left so the board sits beside the right-hand panel. Drag a corner to rotate and tilt, drag the edge to pan, use the wheel or PgUp/PgDn to zoom, and the arrow keys to rotate and tilt |
| Light | Key light from the front right and above, casting soft shadows toward the back left; soft fill light; mild highlights on the pieces |
| Last move | Thin white rings on the from- and to-squares |
| Selection | The selected square is tinted a light blue (≈`#5BA9C8`) |

## Other looks

The default look above follows the main reference. The one-click looks follow their own
references:

| Look | Specification |
|---|---|
| Console Mahogany | Mahogany board with pale and reddish-brown squares, Boxwood & Rosewood pieces, dark blue stone table |
| Marble Edition | A thin board (0.2 of a square) of cool blue-grey marble: light squares `#B7D0DC`, dark `#88A5B0`, crossed by long, light veins that run straight across squares with sharp kinks. Large grey-blue coordinates (0.4 of a square). Red Lacquer & Silver pieces in the Bell shape: wide bell bases about 0.7 across, thin stems and a double collar; king 1.75, queen 1.58, bishop 1.44, knight 1.19, rook 1.05, pawn 0.90. Both sides are polished, mottled and mirror the board. Blue stone table |
| Glass Studio | A clear glass sheet 0.12 of a square thick with a green-tinted edge, printed with frosted-white and glossy black squares and a double black line on a clear border. The pieces mirror in the black squares. Clear glass pieces against mirror-black glass pieces; clear glass casts only a soft contact shadow. A neutral light grey studio sweep with a white backdrop |

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

## Results

Measured comparisons and the tuning history are in [comparison/README.md](comparison/README.md).
