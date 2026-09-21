# hubbub. - Party Game Suite

<div align="left">
    <img src="https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Workers"/>
    <img src="https://img.shields.io/badge/Durable_Objects-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Durable Objects"/>
    <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS"/>
    <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
</div>

**Live:** [hubbub.franciscaportugal2005.workers.dev](https://hubbub.franciscaportugal2005.workers.dev)

## About

Hubbub is a party game you play in the same room. One screen — a TV or a laptop — acts as the shared board and shows a four-letter room code. Everyone else joins from their own phone by typing that code, and their phone becomes their controller. No app to install, no accounts, no sign-up.

The whole thing runs on a single Cloudflare Worker. Each room is one Durable Object, which makes the room itself the authority on its own state: there is no shared database to contend on, no cross-instance coordination, and no polling. Rooms hibernate while nothing is happening, so an idle lobby costs nothing to keep open.

> **Status:** early. The first minigame (Word Wall) is complete and playable end to end. The room, lobby, reconnection and round machinery are built to be reused by later games, but only one game exists so far — see [Roadmap](#roadmap).

## Key Features

### Rooms & Joining

- Four-letter room codes, readable off a TV from across the room
- QR code on the host screen so phones can skip typing entirely
- Join by code from any phone browser on any network
- Pre-flight check on the join form, so a wrong code fails with a readable message
- Rooms self-destruct after 30 minutes of inactivity, freeing the code for reuse
- Up to 12 players per room

### Host Screen

- Live lobby showing who has joined and who is still connecting
- Shared round view: the prompt, the countdown, and answers as they land
- Host controls to start a round, end one early, or return to the lobby
- Host authority is token-backed, so a spectator cannot drive the game

### Player Screen (Phone)

- Name entry with the last used name remembered
- Answer submission with a live character counter
- Confirmation state once an answer is in, so nobody double-guesses
- Phone-first layout sized for thumbs

### Connection Handling

- Automatic reconnection with exponential backoff and jitter
- Players keep their seat and their submitted answer across a reconnect
- Queued submissions, so an answer typed while offline is not lost
- Explicit disconnect on page teardown, so leaving a game frees the name immediately
- Survives locking the phone, switching apps, and back/forward navigation

### Word Wall (Minigame 1)

- A prompt appears on the shared screen
- Everyone answers on their phone at the same time
- Answers are hidden from other players until the round ends, so no copying
- 15 prompts, drawn without immediate repeats
- The round ends as soon as everyone has answered, or when the 60-second timer runs out

## Technical Implementation

**Tech Stack**

- Runtime: Cloudflare Workers
- State: Durable Objects with the SQLite storage backend
- Frontend: React 19, TypeScript 5.9, Tailwind CSS 4
- Build: Vite 8 with `@cloudflare/vite-plugin`
- Transport: WebSockets with Hibernation
- Tooling: Wrangler 4, Prettier

**System Architecture**

```
   TV / laptop                      phones
  ┌─────────────┐          ┌─────────────┬─────────────┐
  │ Host screen │          │   Player    │   Player    │
  └──────┬──────┘          └──────┬──────┴──────┬──────┘
         │  WebSocket              │             │
         └─────────────┬───────────┴─────────────┘
                       ▼
         ┌───────────────────────────────┐
         │   Worker (worker/index.ts)    │
         │   static assets + API router  │
         └───────────────┬───────────────┘
                         │  getByName(code)
                         ▼
         ┌───────────────────────────────┐
         │   Room Durable Object         │
         │   game state + round timer    │
         │   (one instance per room)     │
         └───────────────────────────────┘
```

One Worker serves the React app, the API and the WebSocket endpoint, so everything is same-origin and there is no CORS to configure. `run_worker_first` is scoped to `/api/*`, leaving static assets to be served directly by Cloudflare's asset layer.

**Why one Durable Object per room**

A party game is a lot of small, independent, stateful sessions. Addressing each room as `ROOM.getByName(code)` means the room code _is_ the address, so no lookup table is needed, and the object holding the state is the only thing that can mutate it. That removes write contention and the class of bugs where two servers disagree about whose turn it is.

**Design decisions worth knowing**

| Decision                                  | Reasoning                                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full state snapshots, never diffs         | A room is a few kilobytes of short strings. Snapshots delete the entire "my client drifted out of sync" category of bugs, which matters when players are on flaky phone connections.                                                             |
| Connectivity derived from live sockets    | A stored `connected` flag outlives the socket it describes and never recovers from a close event that goes missing. It is computed from the open socket set instead.                                                                             |
| Refusals sent _over_ the socket           | Browsers report a rejected WebSocket upgrade as an opaque 1006 with no status or body. The server completes the handshake, sends a real error, then closes with code `4001`, so "that name is taken" is readable instead of "connection failed". |
| Heartbeat as a bare string                | `ping`/`pong` are plain strings, not JSON, so the Durable Object's auto-responder can answer them without waking the object and burning duration.                                                                                                |
| Client mints its own player ID            | `crypto.randomUUID` is unavailable over plain HTTP, which is exactly how phones reach a laptop on a LAN. IDs come from `getRandomValues` and are stored per room, which also fixes the identity race on first connect.                           |
| Code alphabet excludes `I`, `O`, `0`, `1` | People misread these off a TV constantly.                                                                                                                                                                                                        |
| Host token in `sessionStorage`            | Hosting should not leak into a new tab; player identity in `localStorage` should survive a refresh.                                                                                                                                              |
| A ~30 line router                         | Three screens and no nested layouts. A routing library would be more configuration than code.                                                                                                                                                    |

**Wire Protocol**

`shared/protocol.ts` is imported by the Worker, the Durable Object and the browser, so the contract cannot drift between them. Validators live there too and run on both sides — the client copy is for instant feedback, the server copy is the one that is trusted.

| Client → Server | Who    | Effect                     |
| --------------- | ------ | -------------------------- |
| `start`         | host   | lobby or results → prompt  |
| `submit`        | player | send an answer to the wall |
| `skip`          | host   | end the round early        |
| `reset`         | host   | back to the lobby          |

| Server → Client | Payload                                                               |
| --------------- | --------------------------------------------------------------------- |
| `welcome`       | your identity plus a full state snapshot                              |
| `state`         | a full state snapshot                                                 |
| `error`         | an `ErrorCode`, a readable message, and whether retrying is pointless |

Answers are withheld from players during the `prompt` phase, so a phone cannot be used to read everyone else's answer before writing its own. The host screen receives them because the host screen is the thing everyone is already looking at.

**HTTP API**

| Method | Path                  | Purpose                                            |
| ------ | --------------------- | -------------------------------------------------- |
| `POST` | `/api/rooms`          | Create a room; returns its code and a host token   |
| `GET`  | `/api/rooms/:code`    | Does this room exist? Lets the join form fail fast |
| `GET`  | `/api/rooms/:code/ws` | WebSocket upgrade, forwarded to the room           |

**Round & Lifecycle Timing**

A Durable Object has a single alarm slot, so one alarm is multiplexed between the two deadlines that matter — the end of the current round and room expiry — by always scheduling whichever comes first.

| Constant            | Value  | Meaning                                      |
| ------------------- | ------ | -------------------------------------------- |
| `ROUND_SECONDS`     | 60     | Round length before the server force-ends it |
| `ROOM_IDLE_MS`      | 30 min | Inactivity before a room deletes itself      |
| `MAX_PLAYERS`       | 12     | Players per room                             |
| `MAX_NAME_LENGTH`   | 12     | Characters in a display name                 |
| `MAX_ANSWER_LENGTH` | 80     | Characters in an answer                      |
| `CODE_LENGTH`       | 4      | Characters in a room code                    |

## Setup and Installation

### Prerequisites

- Node.js 20+ (developed on 24)
- npm 10+
- A Cloudflare account — only needed to deploy, not to run locally

### Quick Start

1. **Clone the repository**

   ```bash
   git clone git@github.com:franpts2/hubbub.git
   cd hubbub
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start the development server**

   ```bash
   npm run dev
   ```

Access the application at http://localhost:5173. Durable Objects run locally through Wrangler's local runtime, so nothing needs to be deployed and no Cloudflare login is required to play.

To try it properly, open http://localhost:5173 in one window, click through to host a room, then open the join link in a second window (or scan the QR code with a phone on the same network).

### Playing on Real Phones

Phones need to reach your machine, so bind the dev server to your network:

```bash
npm run dev:lan
```

Wrangler prints a `http://192.168.x.x:5173` address. Scan the host screen's QR code, or type that address on the phone. This is why player IDs are generated with `getRandomValues` rather than `crypto.randomUUID` — a LAN address is plain HTTP, which is not a secure context.

If your network blocks device-to-device traffic (common on guest and university Wi-Fi), tunnel instead. Serve the built output rather than the dev server, since Vite rejects requests arriving under an unknown host name:

```bash
npm run build                                    # required first: see note below
npx wrangler dev --port 8787                     # terminal 1
cloudflared tunnel --url http://localhost:8787   # terminal 2
```

The build is not optional here. `npm run build` writes a redirect config into `.wrangler/`, which is what points a bare `wrangler dev` at the bundled client; without it, Wrangler has no asset directory to serve. You lose HMR this way, so prefer `npm run dev:lan` when the network allows it.

### Available Scripts

| Script              | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Dev server with HMR and a local Durable Object runtime       |
| `npm run dev:lan`   | Same, exposed on your local network for phones               |
| `npm run build`     | Production build, then a type check                          |
| `npm run preview`   | Build, then serve the output as it will be deployed          |
| `npm run deploy`    | Build and deploy to Cloudflare                               |
| `npm run typecheck` | Regenerate binding types, then check                         |
| `npm run typegen`   | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |
| `npm run format`    | Prettier                                                     |

### Deploying

```bash
npx wrangler login
npm run deploy
```

The current deployment lives at [hubbub.franciscaportugal2005.workers.dev](https://hubbub.franciscaportugal2005.workers.dev). `wrangler.jsonc` pins `account_id`, so `npm run deploy` always targets that account even if your Wrangler login has access to several.

Everything in `wrangler.jsonc` is free-tier compatible. Durable Objects need the SQLite storage backend to be available without a paid plan, which is what `new_sqlite_classes` in the migration selects.

### Troubleshooting

**`npm install` fails on `@cloudflare/*` with a 401 or a token error**

The committed `.npmrc` points the `@cloudflare` scope at the public npm registry. It exists because a global `~/.npmrc` may route that scope to an internal registry gateway that needs an `NPM_TOKEN`. If installs still fail, check that the project-local `.npmrc` is being picked up:

```bash
npm config get @cloudflare:registry   # expect https://registry.npmjs.org/
```

**Type errors about `Env` or missing bindings**

`worker-configuration.d.ts` is generated, not committed. Regenerate it:

```bash
npm run typegen
```

**A phone cannot reach the dev server**

Confirm both devices are on the same network and that it allows client-to-client traffic. Guest and university networks usually do not — use the `cloudflared` tunnel above.

**Stale local room state**

Local Durable Object data lives in `.wrangler`. Deleting it resets every room:

```bash
rm -rf .wrangler && npm run dev
```

## Project Structure

```
hubbub/
├── shared/
│   └── protocol.ts            # Wire contract: state, messages, limits, validators
│                              # imported by worker AND client so they cannot drift
├── worker/
│   ├── index.ts               # Worker entry: asset serving + API routing
│   ├── room.ts                # Room Durable Object: all game logic and state
│   ├── codes.ts               # CSPRNG room codes and host tokens
│   └── prompts.ts             # Word Wall prompt list
├── src/
│   ├── main.tsx               # React entry
│   ├── App.tsx                # Route switch
│   ├── index.css              # Tailwind theme and design tokens
│   ├── screens/
│   │   ├── Home.tsx           # Host a room, or join one by code
│   │   ├── HostScreen.tsx     # The shared TV screen
│   │   └── PlayerScreen.tsx   # The phone controller
│   ├── components/
│   │   ├── ui.tsx             # Shared primitives
│   │   └── QrCode.tsx         # Join QR for the host screen
│   └── lib/
│       ├── useRoomSocket.ts   # Reconnecting socket: backoff, heartbeat, outbox
│       ├── session.ts         # Player ID, host token and name persistence
│       ├── router.ts          # Minimal history router
│       ├── api.ts             # REST calls
│       └── useCountdown.ts    # Deadline countdown
├── index.html
├── wrangler.jsonc             # Worker config, DO binding, asset rules
├── vite.config.ts
├── tsconfig.json
└── .npmrc                     # Pins @cloudflare to the public registry
```

## Roadmap

- [x] Rooms, codes, QR joining and the lobby
- [x] Reconnection that survives locked phones and flaky Wi-Fi
- [x] Word Wall — everyone answers a prompt on the shared screen
- [ ] Scoring and voting on answers
- [ ] A second minigame, at which point the shared round machinery gets pulled out into a game engine
- [ ] Round history and an end-of-game summary
- [ ] Sound and animation on the host screen
- [ ] Reconnect as host after closing the TV tab

The game engine abstraction is deliberately deferred. One game is not enough information to know what the right seam is, and guessing produces an abstraction that fits exactly one case.

## Author

Built by [Francisca Portugal](https://github.com/franpts2).
