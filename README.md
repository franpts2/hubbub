# Hubbub

[![Live site](https://img.shields.io/badge/Live_Site-hubbub.franciscaportugal2005.workers.dev-ff3d81)](https://hubbub.franciscaportugal2005.workers.dev)
[![CI and deploy](https://github.com/franpts2/hubbub/actions/workflows/ci.yml/badge.svg)](https://github.com/franpts2/hubbub/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<div align="left">
	<img src="https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Workers"/>
	<img src="https://img.shields.io/badge/Durable_Objects-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Durable Objects"/>
	<img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React"/>
	<img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
	<img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"/>
	<img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite"/>
</div>

A party game for one room and a lot of phones. The television shows the board and a
four-letter room code; everyone else joins from a browser and their phone becomes a
controller. No app, no accounts, no sign-up.

Named for the noise a room makes when everyone answers at once, **Hubbub** is a real-time
multiplayer experiment in doing a lot with very little: one Cloudflare Worker, one Durable
Object per room, and three games that all have to share the same table.

## About

Hubbub is built for the ten minutes before dinner, when everyone is already in the same
room. One screen is the shared board — a TV, a laptop, whatever is nearest. Everyone else
opens a link, types a code or scans a QR code, and plays from the phone already in their
hand.

The whole thing runs on a single Worker. Each room is one Durable Object, which makes the
room itself the authority on its own state: no shared database to contend on, no
cross-instance coordination, no polling. A room hibernates while nothing is happening, so
an idle lobby costs nothing to keep open.

There are three minigames — Word Wall, Crowd Favourite and Hot Potato — chosen by the host
before the room opens. The room machinery is separated from all three behind a small game
engine, which is what keeps adding a game from touching the platform.

[Open the deployed application](https://hubbub.franciscaportugal2005.workers.dev)

## Key Features

- **One shared screen, many phones** — the host opens the board; everyone else joins from
  a browser. Nothing to install and nothing to sign up for.
- **Four-letter room codes** — readable off a TV from across the room, with `I`, `O`, `0`
  and `1` left out because people misread them.
- **QR joining** — the host screen carries a code phones can scan instead of typing.
- **Rooms that know they are rooms** — one Durable Object per room owns its seats,
  sockets, timers and game state. Nothing else can mutate it.
- **Reconnection that keeps your seat** — exponential backoff with jitter, queued
  submissions, and a seat that survives locking the phone or switching apps.
- **Rooms that expire** — 30 minutes of inactivity deletes the room and frees the code,
  with up to 12 players per room.
- **Host authority** — starting, ending and returning to the lobby are token-backed, so a
  spectator cannot drive the game.
- **Secrets kept server-side** — hidden answers are withheld when a snapshot is built,
  not hidden in the UI.
- **Three games, one table** — Word Wall, Crowd Favourite and Hot Potato.
- **Word Wall** — everyone answers the same prompt; answers stay hidden until the round
  ends, so nobody can copy.
- **Crowd Favourite** — write, then vote anonymously across three rounds. Your phone knows
  which answer is yours; the server refuses a self-vote too.
- **Hot Potato** — take turns naming something in a category. Repeat an answer and the
  server refuses it, let the clock run out and you are out, or challenge an answer and let
  the table decide.
- **Same-origin by construction** — the Worker serves the app, the API and the WebSocket
  endpoint, so there is no CORS to configure.

## How to Play

| Action              | Control                                                            |
| ------------------- | ------------------------------------------------------------------ |
| Host a room         | Pick a game on the home screen and press **Host**                  |
| Join                | Enter the four-letter code, or scan the QR code on the host screen |
| Answer or vote      | Type on your phone and submit; the phone confirms when it lands    |
| Return to the lobby | The host screen has an end-game control during play                |
| Leave               | Close the tab; your seat is released immediately                   |
| Reconnect           | Reopen the link; the same browser keeps its seat and name          |

## Live Demo

Live at: [https://hubbub.franciscaportugal2005.workers.dev](https://hubbub.franciscaportugal2005.workers.dev)

To run it locally instead:

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173). Open the host screen in one window
and the join link in another — or on a phone — to play.

## Technical Implementation

**Tech Stack**

- Runtime: Cloudflare Workers
- State: Durable Objects with the SQLite storage backend
- Frontend: React 19, TypeScript 5.9, Tailwind CSS 4
- Build: Vite 8 with `@cloudflare/vite-plugin`
- Transport: WebSockets with Hibernation
- Testing: Vitest 4, two projects — plain Node for the rules, real workerd for the effects
- Tooling: Wrangler 4, ESLint, Prettier

**Folder Structure**

```text
hubbub/
├── .github/workflows/ci.yml   ← format, types, tests, build, dry-run deploy
├── shared/                    ← platform wire contract; worker and client both import it
│   ├── protocol.ts
│   └── validation.ts
├── engine/                    ← what a game must provide; no game logic of its own
│   ├── ids.ts
│   ├── server.ts              ← GameDefinition: create / apply / deadline / view
│   ├── client.ts              ← GameClient: HostView + PlayerView
│   └── testing.ts
├── games/
│   ├── server.ts              ← registry of server halves (worker bundle)
│   ├── client.ts              ← registry of client halves (browser bundle)
│   ├── word-wall/             ← shared.ts, prompts.ts, server.ts, client/
│   ├── crowd-favourite/       ← shared.ts, prompts.ts, server.ts, client/
│   └── hot-potato/            ← shared.ts, categories.ts, server.ts, client/
├── worker/
│   ├── index.ts               ← asset serving, API routing and WebSocket upgrades
│   ├── codes.ts               ← CSPRNG room codes and host tokens
│   └── room/                  ← the Room Durable Object, split by concern
│       ├── Room.ts            ← lifecycle, effects, delegation to the game
│       ├── state.ts           ← the room as data and its legal transformations
│       ├── storage.ts         ← the only code that knows how a room persists
│       ├── sockets.ts         ← attachments, tagging, best-effort sends
│       ├── presence.ts        ← connectivity derived from live sockets
│       ├── credentials.ts     ← constant-time token comparison
│       ├── join.ts            ← who is connecting: the security boundary
│       ├── commands.ts        ← routes a message to the platform or the game
│       ├── projection.ts      ← builds the snapshot for one viewer
│       ├── alarms.ts          ← multiplexes game deadline vs. room expiry
│       ├── testing.ts         ← a fake game, so the room is tested game-agnostically
│       └── testing-socket.ts  ← drives a room over a real socket on workerd
├── src/
│   ├── screens/               ← home, host (shared screen) and player (phone)
│   ├── components/            ← UI primitives, feedback screens and the join QR
│   ├── hooks/                 ← reconnecting socket, countdown, router, home actions
│   ├── lib/                   ← connection, session, routes, URLs and REST calls
│   ├── App.tsx
│   ├── index.css              ← Tailwind theme: colour, easing, keyframes
│   └── main.tsx
├── index.html
├── wrangler.jsonc             ← Worker config, DO binding, asset rules
├── vite.config.ts
├── vitest.config.ts           ← two projects: node rules, workerd effects
├── tsconfig.json
├── package.json
└── .npmrc                     ← pins @cloudflare to the public npm registry
```

Tests live beside the code and are omitted above: `*.test.ts` for the rules, which run in
Node, and `*.workers.test.ts` for the effects, which run on workerd.

**How it fits together**

- One Worker serves the React app, the API and the WebSocket endpoint, so everything is
  same-origin. `run_worker_first` is scoped to `/api/*`, leaving static assets to
  Cloudflare's asset layer.
- A room is addressed as `ROOM.getByName(code)`, so the room code _is_ the address and no
  lookup table is needed. The object holding the state is the only thing that can mutate
  it.
- The platform owns the room: codes, seats, names, presence, sockets, persistence,
  broadcasting, reconnection, expiry, and the single `lobby`/`playing` distinction. A game
  owns what happens after the host presses start.
- A game never touches a socket, writes to storage or schedules an alarm. It is handed a
  snapshot of the table, mutates its own state, and returns `changed` / `ignored` /
  `rejected`; the platform decides what that costs in persistence and fan-out.
- The two registries are deliberately separate files. The Worker bundle contains no React,
  and the client bundle contains no game rules.
- Snapshots are always full, never diffs. A room is a few kilobytes of short strings, and
  this deletes the entire "my client drifted out of sync" category of bugs.
- `view(state, viewer)` is built per connection, not per role, so one phone can be told
  something no other phone is told. Hidden information is withheld server-side.
- A Durable Object has one alarm slot, so the active game's deadline and room expiry are
  multiplexed onto it by always scheduling whichever comes first.

**What the games proved**

The engine was derived from Word Wall alone and deliberately kept as small as one game
needed. Crowd Favourite was the first test: it needed two additions, per-viewer `view` and
a game-declared `minPlayers`, and expressed everything else itself. Hot Potato was chosen
specifically because it is turn-based where the others are simultaneous, and it needed no
engine changes at all. Three differently shaped games, two additions total.

**Adding a game**

1. Add its id to `engine/ids.ts`.
2. Write `games/<id>/shared.ts`, a `GameDefinition` and a `GameClient`.
3. Register it in `games/server.ts` and `games/client.ts`.
4. Add its server-side files to the coverage allow-list in `vitest.config.ts`.

Nothing in `shared/`, `worker/` or `src/` changes, and the game picker on the home screen
fills itself in from the client registry.

## Getting Started

**Prerequisites:** Node.js 22+ and npm 10+. No Cloudflare account is needed to run locally —
Durable Objects run through Wrangler's local runtime.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run preview    # build and serve the production output
npm run typecheck  # regenerate binding types, then TypeScript
npm run lint       # ESLint
npm run format     # Prettier
npm run deploy     # build and deploy to Cloudflare Workers
```

### Playing on Real Phones

Phones need to reach your machine, so bind the dev server to your network:

```bash
npm run dev:lan
```

Wrangler prints a `http://192.168.x.x:5173` address. Scan the host screen's QR code, or type
that address on the phone.

If your network blocks device-to-device traffic (common on guest and university Wi-Fi),
tunnel instead. Build first, then serve the built output:

```bash
npm run build
npx wrangler dev --port 8787
cloudflared tunnel --url http://localhost:8787
```

The build is not optional here: it writes the redirect config that points a bare
`wrangler dev` at the bundled client.

## Testing

Tests sit next to the code they cover, in two suites:

```bash
npm test               # both suites, once
npm run test:unit      # the rules, in plain Node
npm run test:workers   # the Durable Object and API, on real workerd
npm run test:coverage  # both, with coverage thresholds enforced
```

The rules and the effects are tested differently on purpose. Game logic is functions over
plain objects that import nothing from `cloudflare:workers`, so it runs in Node — all 317
tests finish in about five seconds. `Room.ts` is the effects themselves: hibernation, the
socket set, attachments that outlive memory, the single alarm slot. It runs on real workerd
under `@cloudflare/vitest-plugin`, against the same `wrangler.jsonc` the app deploys with.

Coverage is an allow-list of modules the suites can honestly cover: currently 97.9% of
statements and 96.7% of branches. The React layer is not covered yet, and the config says so
rather than pretending otherwise.

## Deployment

Hubbub is hosted on Cloudflare Workers Static Assets at
[hubbub.franciscaportugal2005.workers.dev](https://hubbub.franciscaportugal2005.workers.dev).
The Worker, its Durable Object binding and its migrations are declared in
[`wrangler.jsonc`](./wrangler.jsonc), so a deploy only needs:

```bash
npm run deploy
```

Pushes to `main` deploy automatically through GitHub Actions. The workflow needs two
repository secrets: `CLOUDFLARE_API_TOKEN`, scoped to Workers, and `CLOUDFLARE_ACCOUNT_ID`.
Neither is committed, so a fork only has to supply its own values.

Everything in `wrangler.jsonc` is free-tier compatible. Durable Objects use the SQLite
storage backend, selected by `new_sqlite_classes` in the migration.

## Roadmap

- [x] Rooms, codes, QR joining and the lobby
- [x] Reconnection that survives locked phones and flaky Wi-Fi
- [x] Word Wall — everyone answers a prompt on the shared screen
- [x] Game engine: the room machinery separated from any one game's rules
- [x] Tests over the rules, the security boundary and the platform/game seam
- [x] CI: format, types, tests with coverage thresholds, build and a dry-run deploy
- [x] Crowd Favourite — the second minigame, and the first real test of the engine's seams
- [x] Voting, anonymity and scoring across rounds
- [x] A game picker, so the host chooses what the room will play
- [x] CD: a green push to `main` deploys itself
- [x] Hot Potato — the third minigame, and the first with turn order
- [x] Elimination, a challenge mechanic, and not stalling on a player who drops
- [x] The Durable Object under test on real workerd, hibernation included
- [ ] Round history and an end-of-game summary
- [ ] Sound and animation on the host screen
- [ ] Reconnect as host after closing the TV tab
- [ ] A fourth game that needs teams, or hidden roles

The engine has now run three games that work differently, which moved its seams from a
hypothesis to something with evidence behind it. The next useful test is probably a game
with **teams or hidden roles**, since all three so far treat every player as an identical,
independent seat.

## Performance Notes

- Rooms hibernate while idle, so an open lobby costs nothing beyond storage.
- Full snapshots are a few kilobytes at this scale, and per-viewer serialisation costs at
  most a dozen small payloads per broadcast at the 12-player cap.
- One Durable Object alarm slot is shared between the active game's timer and room expiry,
  rather than polling or running a second scheduler.

## License

MIT © 2026 Francisca Portugal. See [LICENSE](./LICENSE).

## Notes

- Hubbub stores no personal data beyond the display name a player types. That name lives in
  the room's Durable Object and the room deletes itself after 30 minutes of inactivity.
- Player identity is kept in `localStorage`; the host token lives in `sessionStorage`, so
  hosting does not leak into a new tab.
- There is no analytics, no tracking and no third-party service beyond Cloudflare.

---

_Hubbub by Francisca Portugal — frontend engineer._
