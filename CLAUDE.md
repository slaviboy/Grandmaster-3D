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
- **Product naming.** The product is Grandmaster 3D. The commercial game whose look inspired it is
  never named in tracked files: not in source, comments, identifiers, UI strings, documentation or
  commit messages. Write "the reference" instead. `tests/architecture/branding.test.ts` enforces
  this. The reference screenshots stay in `docs/reference/`, which is gitignored.
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
```

## Rules that keep the game correct

- **chess.js is the authority.** Only `src/game/ChessGame.ts` imports it. Engine moves are
  validated like player moves.
- **Generations, not hope.** Every position change bumps the controller's generation. Async work
  (searches, animations, thinking pauses) checks it before touching anything.
- **The piece map leads, meshes follow.** `PieceManager` records the logical position first.
  Animations only move meshes, and `finishAll()` + `sync()` must always restore a correct board.
- **One coordinate convention.** Defined in `src/scene/coords.ts`: 1 unit = 1 square, White at +z.
  Flipping turns the camera, never the board.
- **Engine sequencing.** Change options only between searches. After `stop`, wait for `bestmove`
  (Stockfish may answer `isready` first).
