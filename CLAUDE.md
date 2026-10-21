# Grandmaster 3D

A 3D chess game for the browser: three.js scene, Blender-made pieces, chess.js rules, Stockfish in a
Web Worker, and an interface in the style of a classic desktop chess game. Read `README.md` for
features and commands, and `docs/visual-spec.md` for the target look.

## Commit rules

These are enforced by `.githooks/`, enabled with `git config core.hooksPath .githooks`.

- **Author.** Every commit is authored by `slaviboy <slavi94slavi94@gmail.com>`. The repository's
  local git config sets this, and `pre-commit` rejects anything else.
- **No co-author trailers.** `commit-msg` strips `Co-Authored-By:` lines. Do not add them.
- **License headers.** The project is GPL-3.0-or-later. Every hand-written source file starts with
  the GPL header (`Copyright (C) 2026 Stanislav Georgiev`, `https://github.com/slaviboy`, GNU
  General Public License). `tests/architecture/licenseHeaders.test.ts` enforces this.
- **No secrets.** `tests/architecture/secrets.test.ts` scans tracked files.
- **Nothing private.** The repository is public. No e-mail address but the author's, no path of
  the computer the work is done on, no copyright holder who is not credited, and no metadata in
  images (strip it with `node scripts/image-metadata.ts strip <files>`). This applies inside
  binary files too: Blender writes paths into renders and into the .blend, so save the .blend
  through `common.save_blend`. `tests/architecture/identity.test.ts` enforces this, and
  `npm run audit` checks every commit in the history (the deploy workflow runs it). The rules live
  in `scripts/public-safety.ts`.
- **Product naming.** The product is Grandmaster 3D. The commercial game whose look inspired it is
  never named in tracked files: not in source, comments, identifiers, UI strings, documentation or
  commit messages. Write "the reference" instead. `tests/architecture/branding.test.ts` enforces
  this, also inside images and models. The reference screenshots stay in `docs/reference/`, which is
  gitignored; never publish a picture that shows the reference, even beside our own.
- **Messages.** Use conventional prefixes (`feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `docs:`,
  `chore:`, `ci:`) in the imperative mood, with a body that says what changed and why. Make one
  meaningful change per commit, and commit after every one.

## Commands

```
npm run dev          # Vite dev server
npm run build        # type-check, then production build
npm test             # Vitest: unit + architecture (the real engine runs in Node)
npm run test:e2e     # Playwright against the production build
npm run lint         # ESLint
npm run format:check # Prettier
npm run models       # rebuild the pieces with headless Blender
npm run ladder       # difficulty strength ladder
npm run audit        # the whole history: authors, messages, every file version (public safety)
npm run audit:dist   # the built site: no source maps, local addresses or private data
```

## Rules that keep the game correct

- **chess.js is the authority.** Only `src/game/ChessGame.ts` imports it. Engine moves are
  validated like player moves.
- **Generations, not hope.** Every position change bumps the controller's generation. Async work
  (searches, animations, thinking pauses) checks it before touching anything.
- **The piece map leads, meshes follow.** `PieceManager` (and `FlatPieces` on the 2D board) records
  the logical position first. Animations only move meshes or figures, and finishing + `sync()` must
  always restore a correct board. Callers of the controller's `interrupt()` sync the view after it.
- **Two boards, one game.** The controller plays through `ViewSwitch` (`src/app/`): the shown board
  animates and takes input, the hidden one is synced to the same position on every move. The 2D
  board (`src/flat/`) draws nothing while hidden; the hidden 3D scene skips rendering but its
  updaters keep running (they drive the clocks).
- **One coordinate convention.** Defined in `src/scene/coords.ts`: 1 unit = 1 square, White at +z.
  The 2D board uses the same coordinates seen from above. Flipping turns the camera (or the 2D
  board's view), never the board; the camera's side is the single source of orientation for both.
- **Online, each side referees what it receives.** Everything from the other player passes
  `PeerGuard` (size, rate, shape), `OnlineSession` (who may say what, when) and the controller
  (`applyRemoteMove`, the rules of chess). Never trust their times, results or media state; time
  them on this side's clock and show their camera from the tracks that arrive. A rule break
  forfeits and disconnects. Only `src/net/PeerLink.ts` touches Trystero or a peer connection;
  never put network objects on `window` or log addresses, candidates or SDP. Every online game
  starts with the 18+ and IP warning, its box unticked, before anything connects.
- **Engine sequencing.** Change options only between searches. After `stop`, wait for `bestmove`
  (Stockfish may answer `isready` first).
