# Grandmaster 3D

A 3D chess game for the browser in the style of the classic early-2000s desktop chess games. It has
a wooden board on a blue cloth, Staunton pieces turned in Blender, teal panels, and Stockfish as
your opponent at six difficulty levels.

![The game](docs/screenshots/game.jpg)

## Features

- **A real 3D board.** Drag a corner of the board to rotate and tilt it, drag an edge to pan, and
  use the wheel or PgUp/PgDn to zoom. The arrow keys also rotate and tilt, as in the classic games.
  You can also right-drag anywhere, use two fingers on a touch screen, and press Home to reset.
- **Pieces modelled in Blender**, from profiles measured on reference screenshots. The knight is
  carved from a side silhouette into a horse head with ears, eyes, nostrils and a grooved mane. A
  shader gives the wood growth rings and grain, under a lacquer coat.
- **Stockfish 19** runs in a Web Worker at six levels: Beginner, Easy, Medium, Hard, Expert and
  Maximum Strength.
- **The full rules from chess.js**:
  - castling, en passant and promotion (with a choice of piece)
  - check, checkmate, stalemate and the draw rules (fifty moves, threefold repetition,
    insufficient material)
  - resignation and flag fall
- **Clocks** of 5, 10, 15 or 30 minutes per player, or untimed.
- **Undo and redo**, PGN and FEN import and export, a two-player mode, and flipping the board.
- **Chess Coach** board aids and commentary:
  - legal, capture and check moves
  - danger zones, safe zones and board coverage
  - isolated and passed pawns
  - hints from the engine
- **Optional animations**, both off by default:
  - *Follow move path*: pieces travel their real route. The knight goes two squares, turns and goes
    one more, lifting over pieces in its way.
  - *Demolish captures*: the captured piece shatters into wooden fragments that were pre-fractured
    in Blender.
- Sounds synthesised with Web Audio, so there are no audio files.

| Chess Coach and move list | Rotated and zoomed |
| --- | --- |
| ![Coach](docs/screenshots/coach.jpg) | ![Rotated](docs/screenshots/rotated.jpg) |

## Getting started

You need Node.js 22 or later (24 LTS recommended).

```sh
npm install      # also copies the Stockfish engine into public/engine/
npm run dev      # http://localhost:5173
```

```sh
npm run build    # type-check and build into dist/
npm run preview  # serve the production build
```

## Tests

```sh
npm test               # unit and architecture tests (Vitest), including the real engine
npm run test:e2e       # end-to-end tests on the production build (Playwright, needs WebGL)
npm run ladder -- 8    # each difficulty plays the next one up, 8 games per pair
npm run lint && npm run format:check
```

For development and tests, the page accepts these URL parameters:

| Parameter | Effect |
| --- | --- |
| `fen=` | Start from a position |
| `anim=0` | Instant animations |
| `engine=off` | No engine |
| `difficulty=` | Difficulty level |
| `seed=` | Seed for the random generator |
| `debug=1` | Adds `window.__chessDebug` |

## Rebuilding the chess pieces

The pieces come from Python scripts that run in headless Blender (tested with Blender 5.2 LTS):

```sh
npm run models                 # build the set, export the GLBs, render previews
npm run models -- fragments    # re-fracture the pieces for Demolish captures
BLENDER=/path/to/blender npm run models
```

The modelling scripts live in [blender/scripts/](blender/scripts/):

| Script | What it does |
| --- | --- |
| `profiles.py` | The lathe profiles |
| `pieces.py` | The turned pieces |
| `knight.py` | The carved knight |
| `build_set.py` | Builds and checks the whole set |
| `export_glb.py` | Exports the GLB files |
| `render_previews.py` | Renders the previews |
| `fracture.py` | Fractures the pieces into fragments |

The editable source is `blender/chess_set.blend`, previews are in [blender/renders/](blender/renders/),
and the exported models are in `public/models/chess/`.

## How it is built

```
src/game/     rules (ChessGame over chess.js), controller state machine, clock, settings, coach
src/engine/   UCI parsing, Stockfish adapter, Web Worker transport, difficulty presets, move policy
src/scene/    three.js scene, board, camera controls, piece loading and placement, highlights,
              input, move animations and paths, shatter effect
src/ui/       menu bar, panels, dialogs, icons
src/app/      wires everything together
blender/      modelling scripts, source .blend, renders
tests/        unit, architecture and end-to-end tests
```

chess.js is the authority: no move reaches the board unless it is legal, and engine moves are
checked like anyone else's. Every change of position bumps a generation number, and late engine
replies or interrupted animations are dropped. In development a consistency checker compares the 3D
board with the rules after every move.

## Deployment

The build is a static site with relative URLs, so it works on any static host, including from a
subpath. The included GitHub Actions workflow deploys it to GitHub Pages on every push to `main`
(once, set Settings → Pages → Source: GitHub Actions).

The engine is the single-threaded lite build of Stockfish (about 1.8 MB of WebAssembly). It needs no
special headers: no cross-origin isolation, no `SharedArrayBuffer`. The server only has to send
`.wasm` files as `application/wasm`, as GitHub Pages and most hosts do.

## Known limitations

- Strength labels such as "about 1500" are approximate. Medium and above use Stockfish's own
  UCI_Elo. Beginner and Easy add a move-picking policy on top of the lowest Skill Levels, because
  UCI_Elo stops at 1320.
- The lite engine uses a small neural network. It is far stronger than any human, but weaker than
  the full 94 MB build.
- Game review is limited to stepping back and forward through the moves; there is no annotation.
- End-to-end tests need a browser with WebGL, so CI runs only the unit tests.

## License

Grandmaster 3D is free software under the [GNU General Public License v3 or later](LICENSE). It
includes Stockfish, which is GPL-3.0. Third-party notices are in [NOTICE.md](NOTICE.md).

The look follows classic commercial chess games of the early 2000s. All models, textures, icons,
sounds and code here are original, and no assets from those games are used.
