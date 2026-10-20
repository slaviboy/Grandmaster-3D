# Third-party notices

Grandmaster 3D is distributed under the GNU General Public License version 3 or later (see
[LICENSE](LICENSE)). It includes or depends on the following software.

## Stockfish and Stockfish.js — GPL-3.0

The chess engine is [Stockfish](https://stockfishchess.org/) 19 by the Stockfish developers. It runs
as the WebAssembly "lite single-threaded" build from
[Stockfish.js](https://github.com/nmrugg/stockfish.js) by Nathan Rugg and contributors.

- Engine source: https://github.com/official-stockfish/Stockfish
- WebAssembly build source: https://github.com/nmrugg/stockfish.js (npm package `stockfish` 19.0.1)
- Licence: GNU General Public License v3. The full text is shipped next to the engine as
  `engine/COPYING.txt` and is also this project's [LICENSE](LICENSE).

The engine files (`stockfish-19-lite-single.js` and `.wasm`) are copied unmodified from the npm
package during installation and run as a separate program in a Web Worker, talking to the game over
the UCI protocol.

## three.js — MIT

Copyright © 2010–2026 three.js authors. https://github.com/mrdoob/three.js — MIT License.

## chess.js — BSD 2-Clause

Copyright © 2025 Jeff Hlywa. https://github.com/jhlywa/chess.js — BSD 2-Clause License.

## Assets

The chess pieces were modelled for this project with the Blender scripts in `blender/scripts/`. The
board, cloth and wood textures are generated procedurally at runtime. The icons, portraits and
sounds (synthesised with Web Audio) are original. No third-party models, textures, fonts or sound
files are included.
