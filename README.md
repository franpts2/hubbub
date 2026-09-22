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

> **Status:** early, but no longer single-game. Three minigames — Word Wall, Crowd Favourite and Hot Potato — are playable end to end, chosen by the host before the room opens. The room machinery is separated from all three behind a game engine, and the second and third games are what tested that separation: the second needed two additions to the engine, and the third, built to be structurally unlike both, needed none. See [Platform vs. game](#architecture) for the detail and [Roadmap](#roadmap) for what is next.

## Key Features

### Rooms & Joining

- Four-letter room codes, readable off a TV from across the room
- QR code on the host screen so phones can skip typing entirely
- Join by code from any phone browser on any network
- Pre-flight check on the join form, so a wrong code fails with a readable message
- Rooms self-destruct after 30 minutes of inactivity, freeing the code for reuse
- Up to 12 players per room

### Host Screen

- Pick which game the room will play before opening it
- Live lobby showing who has joined and who is still connecting
- Start button that says how many more players the chosen game needs
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
- Plays with a single player, since nobody is competing

### Crowd Favourite (Minigame 2)

- Three rounds of write-then-vote, with a running score
- Everyone answers one prompt, then votes for their favourite answer
- Answers are shown anonymously, and the ballot is shuffled so submission order gives nothing away
- Your phone knows which answer is yours and will not let you vote for it; the server refuses it too
- 100 points per vote received, carried across all three rounds
- Needs three players, and the lobby says so until it has them
- Each phase ends early once everyone is done, or on its own timer (60s to write, 45s to vote)
- 20 prompts, none repeated within a single game

### Hot Potato (Minigame 3)

- A category appears, and players take turns naming something in it
- Turn order is shuffled at the start of each round and shown on the big screen, so you can see yourself coming
- Repeat something already said and the server refuses it — your clock keeps running, so you can try again
- Let the clock run out and you are out for the round
- Anyone still in can challenge an answer they think does not count, and everyone not involved votes on it
- **A challenge is a duel:** if the table agrees, the answerer is out; if it disagrees, the challenger is. Losing costs you your place either way, which is what stops the button being pressed every turn
- A tie, or a vote nobody casts, leaves the answer standing — the burden of proof is on whoever interrupted
- With only two players left the challenge window disappears entirely, because nobody is left to judge
- 10 points per surviving answer, 100 for being last standing, over three rounds
- Needs three players, and the lobby says so until it has them
- 22 categories, none repeated within a single game

Whether an answer really fits the category is never decided in code. Word lists lose that argument — someone always names something reasonable that is not on them — so the game only enforces what it can actually know (that an answer is new), and hands the judgement to the table.

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
          │   seats, sockets, timer slot  │
          │   (one instance per room)     │
          └───────────────┬───────────────┘
                          │  delegates play to
                          ▼
          ┌───────────────────────────────┐
          │   the room's game                    │
          │   word-wall | crowd-favourite |      │
          │   hot-potato                         │
          └──────────────────────────────────────┘
```

A room is bound to one game when it is created and keeps it for life, so a game cannot be swapped out from under the phones already playing it.

One Worker serves the React app, the API and the WebSocket endpoint, so everything is same-origin and there is no CORS to configure. `run_worker_first` is scoped to `/api/*`, leaving static assets to be served directly by Cloudflare's asset layer.

**Why one Durable Object per room**

A party game is a lot of small, independent, stateful sessions. Addressing each room as `ROOM.getByName(code)` means the room code _is_ the address, so no lookup table is needed, and the object holding the state is the only thing that can mutate it. That removes write contention and the class of bugs where two servers disagree about whose turn it is.

**Platform vs. game**

The split runs through the whole codebase. The platform owns the room: codes, seats, names, presence, sockets, persistence, broadcasting, reconnection, room expiry, and the single `lobby`/`playing` distinction. A game owns what happens after the host presses start — its own phases, its own messages, its own limits.

A game is one object on each side of the wire:

| Provides         | For    | Responsibility                                                                                      |
| ---------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `GameDefinition` | server | `minPlayers`, `create`, `parseCommand`, `apply`, `deadline`, `onDeadline`, `onSeatsChanged`, `view` |
| `GameClient`     | client | a `HostView` for the shared screen, a `PlayerView` for the phone, plus a name, tagline and minimum  |

A game never touches a socket, writes to storage or schedules an alarm. It is handed a snapshot of who is at the table, mutates its own state, and returns `changed` / `ignored` / `rejected`; the platform decides what that costs in persistence and fan-out. Timers work the same way: a game publishes a timestamp from `deadline(state)` and the platform multiplexes it against room expiry in the DO's one alarm slot.

The two registries (`games/server.ts`, `games/client.ts`) are deliberately separate files. A single registry exporting both halves would pull prompt lists and round logic into the browser bundle, and would make importing server code from a component an easy accident. As built, the Worker bundle contains no React and the client bundle contains no game rules.

**What the second game did to the engine**

The interface was originally derived from Word Wall alone and kept as small as that one game required — no scoring, no teams, no private per-player state, no cross-round bookkeeping — on the grounds that inventing those would fit an imaginary game rather than a real one. Crowd Favourite was the test of that bet. It needed two changes:

| Change                                 | Why it could not be faked in the game                                                                                                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view(state, viewer, ctx)`, was `role` | An anonymous vote has to tell each player privately which answer is theirs. A phone cannot work that out for itself, and nobody else may be told, so one payload per role could not express it. The room now serialises one snapshot per connection.                                    |
| `minPlayers`                           | A voting game does not work with one player, and the room is the only thing that counts seats. The number is the game's to declare and the platform's to enforce — the lobby uses it for the button label, and `start_game` refuses below it regardless of what the button was showing. |

Everything else it wanted — three phases, cumulative scoring, shuffling, opaque answer ids, a skip-the-vote path when too few answers arrive — it expressed in its own state with no help from the engine. Two changes for a game deliberately chosen to be unlike the first is the evidence that the opaque-state seam sits in the right place. Per-connection serialisation costs at most a dozen small payloads per broadcast at the 12-player cap, which is a fair price for being able to keep a secret per person.

**What the third game did to the engine**

Nothing. `engine/server.ts` and `engine/client.ts` are untouched by Hot Potato; the only edit anywhere in `engine/` was adding `"hot-potato"` to the list of ids.

That is the result the game was built to find. Both existing games move the whole table through a phase together, so "waiting for a player" had only ever meant waiting for whoever was slowest. A turn-based game was picked precisely because nothing in the engine had ever had to express _it is your move_, and it turned out not to need to:

| What it needed                                      | Where it lives                                                                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Turn order, and rotating it past eliminated players | Its own state — a fixed `order` array plus a shrinking `alive` list. The engine never learns that turns exist.                                                                      |
| A clock per _turn_ rather than per phase            | `deadline(state)` unchanged. It is re-read after every change, so a timer that restarts on each turn is the same mechanism as one that runs for a whole phase.                      |
| An argument interrupting play, then resuming it     | A `stage` union inside its own state. From the platform's side it is one more opaque mutation.                                                                                      |
| Not stalling when the player whose turn it is drops | `onSeatsChanged`, which already existed for a different reason. The other two games use it to stop waiting on someone slow; this one uses it to stop waiting on someone _specific_. |

The last row is the only place the difference genuinely bites, and it is a game rule rather than an engine gap: a dead phone in Word Wall means one missing answer, but a dead phone in Hot Potato is a round that never ends. The game puts that player out for the round and the circle carries on. Three games in, the engine has needed two additions total, both from the second game.

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

**Look and motion**

Two devices, two sets of rules. The shared screen is read from a sofa by a
room that is mostly looking at each other; a phone is read from thirty
centimetres by one person under time pressure. Almost every layout decision
below falls out of that split.

| Decision                                                     | Reasoning                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host boards capped at `max-w-5xl`, prompts uncapped          | A standings row drawn the full width of a television puts a name and its score a metre apart. The prompt is one line of very large type and wants the room; the rows want to stay a pair.                                                                                            |
| Host content is vertically centred, never top-aligned        | A TV holds one phase for a minute at a time. Content hanging from the top edge leaves the bottom half of the screen empty for the whole of it.                                                                                                                                       |
| Custom easing replaces Tailwind's `ease-out` / `ease-in-out` | The stock curves are too gentle to read as deliberate — at 200ms they look like lag rather than movement. There is no `ease-in` token at all: starting slow delays the exact moment a player is watching for a response.                                                             |
| Entrances start at `scale(0.9)`, never `scale(0)`            | Nothing in the world appears from nothing. An element growing from a point reads as a special effect rather than as something arriving.                                                                                                                                              |
| `stagger()` only for lists that appear all at once           | A ballot or a scoreboard lands as one block and is dealt out. The answer wall and the roster fill one item at a time, where a delay would mistime the pop that confirms _your_ answer got through.                                                                                   |
| Disabled buttons are drawn, not dimmed                       | `opacity-40` over this palette turned lime into olive, which looks like a rendering fault rather than a button that is not ready. Disabled drops to the inert surface and loses its shadow, so it is visibly flat on the page.                                                       |
| Transitions name their properties                            | `transition` on its own also animates colour, and a button whose label fades between states looks unsure of itself when what it should look is immediate.                                                                                                                            |
| The countdown digits never animate                           | They change once a second for a whole round. Anything moving at that rate stops being a clock and becomes a distraction. Only the urgent state animates, as one beat per second in step with the digits.                                                                             |
| Reduced motion is gentler, not off                           | Fades stay — they are what explains that something appeared, and removing them substitutes a jump cut. Travel, rotation and the two loops go. Press feedback stays, because a button shrinking 3% under a finger is direct manipulation rather than an animation playing at someone. |

The tokens all live in `src/index.css`. `--tilt` is the one that needs
explaining: Word Wall's cards sit a couple of degrees off-square, and a
`transform` set on the element is simply overwritten while an animation runs,
so the cards used to land flat and snap sideways a frame later. The keyframe
rotates _to_ `var(--tilt)` instead and its fill mode holds it there.

**Wire Protocol**

`shared/protocol.ts` is imported by the Worker, the Durable Object and the browser, so the contract cannot drift between them. It describes rooms and knows nothing about any game. Validation lives in `shared/validation.ts` and runs on both sides — the client copy is for instant feedback, the server copy is the one that is trusted.

There are three messages, because only two things are the platform's business:

| Client → Server | Who    | Effect                                                 |
| --------------- | ------ | ------------------------------------------------------ |
| `start_game`    | host   | lobby → playing, building the game's initial state     |
| `end_game`      | host   | playing → lobby, discarding the game's state           |
| `game`          | anyone | forwarded verbatim to the active game's `parseCommand` |

| Server → Client | Payload                                                          |
| --------------- | ---------------------------------------------------------------- |
| `welcome`       | your identity plus a full state snapshot                         |
| `state`         | a full state snapshot                                            |
| `error`         | an `ErrorCode`, a readable message, and whether to stop retrying |

A snapshot carries the room (`code`, `gameId`, `status`, `players`, `deadline`) plus a `game` field that is opaque to everything between the game's server-side `view` and its own components. That is the seam: a new game adds messages and state without touching the platform, and the platform cannot accidentally depend on one game's shape.

`error` is only fatal when the connection itself will never be accepted — a refused handshake, or a closed room. A complaint about a message (`bad_message`, `wrong_phase`, `game_rejected`, or a host-only command from a player) leaves a healthy socket alone.

Hidden information is withheld server-side, in the game's `view`, never in the UI. Word Wall uses this to keep answers from players during its `prompt` phase, so a phone cannot be used to read everyone else's answer before writing its own — while still sending the list of who has answered, so both screens can show progress. The host screen receives the answers because it is the thing everyone is already looking at.

Because `view` is built per viewer rather than per role, a game can also withhold information from players _individually_. Crowd Favourite needs this in both directions at once: everybody sees the same anonymous list of answers, each phone is privately told which entry is its own, and each phone is told what it voted for and nothing about anyone else's vote. Authorship is a mapping, so keeping it is a matter of publishing nothing that joins the two halves — the candidate list carries no identity, and the standings carry no reference to a candidate. Authors are attached only once voting has closed.

**HTTP API**

| Method | Path                  | Purpose                                                                                                                |
| ------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/rooms`          | Create a room; returns its code and a host token. Accepts an optional `gameId`, which a room is then bound to for life |
| `GET`  | `/api/rooms/:code`    | Does this room exist? Lets the join form fail fast                                                                     |
| `GET`  | `/api/rooms/:code/ws` | WebSocket upgrade, forwarded to the room                                                                               |

**Round & Lifecycle Timing**

A Durable Object has a single alarm slot, so one alarm is multiplexed between the two deadlines that matter — whatever the active game is waiting for and room expiry — by always scheduling whichever comes first. The platform re-reads `deadline(state)` after every change, so a game only has to keep its own state right.

Platform limits, in `shared/protocol.ts`:

| Constant          | Value  | Meaning                                 |
| ----------------- | ------ | --------------------------------------- |
| `ROOM_IDLE_MS`    | 30 min | Inactivity before a room deletes itself |
| `MAX_PLAYERS`     | 12     | Players per room                        |
| `MAX_NAME_LENGTH` | 12     | Characters in a display name            |
| `CODE_LENGTH`     | 4      | Characters in a room code               |

Word Wall's own limits, in `games/word-wall/shared.ts`:

| Constant            | Value | Meaning                                      |
| ------------------- | ----- | -------------------------------------------- |
| `ROUND_SECONDS`     | 60    | Round length before the server force-ends it |
| `MAX_ANSWER_LENGTH` | 80    | Characters in an answer                      |
| `MIN_PLAYERS`       | 1     | Nobody competes, so one player is a game     |

Crowd Favourite's, in `games/crowd-favourite/shared.ts`:

| Constant            | Value | Meaning                                     |
| ------------------- | ----- | ------------------------------------------- |
| `WRITING_SECONDS`   | 60    | Time to answer the prompt                   |
| `VOTING_SECONDS`    | 45    | Time to pick a favourite                    |
| `TOTAL_ROUNDS`      | 3     | Rounds before the final standings           |
| `POINTS_PER_VOTE`   | 100   | Awarded to an answer's author, per vote     |
| `MAX_ANSWER_LENGTH` | 80    | Characters in an answer                     |
| `MIN_PLAYERS`       | 3     | Fewest players a vote is worth running with |

Hot Potato's, in `games/hot-potato/shared.ts`:

| Constant                 | Value | Meaning                                               |
| ------------------------ | ----- | ----------------------------------------------------- |
| `TURN_SECONDS`           | 15    | Time to name something once it is your turn           |
| `REVIEW_SECONDS`         | 4     | Window in which an answer can be challenged           |
| `VOTE_SECONDS`           | 15    | Time to judge a challenge                             |
| `TOTAL_ROUNDS`           | 3     | Rounds before the final standings                     |
| `POINTS_PER_ANSWER`      | 10    | Awarded for each answer that survives                 |
| `POINTS_PER_ROUND`       | 100   | Awarded for being last standing                       |
| `MAX_ANSWER_LENGTH`      | 60    | Characters in an answer                               |
| `MIN_PLAYERS`            | 3     | Answerer, challenger and at least one judge           |
| `MIN_ALIVE_TO_CHALLENGE` | 3     | Below this the challenge window is skipped altogether |

`REVIEW_SECONDS` is the one number that is a pure feel judgement rather than a constraint: it is dead time on every single turn, so it buys the table just enough to react and no more.

Each `MIN_PLAYERS` is imported by both halves of its game — the server definition that enforces it and the client that explains it — so the number the lobby shows and the number the server checks cannot drift apart.

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

| Script                  | What it does                                                 |
| ----------------------- | ------------------------------------------------------------ |
| `npm run dev`           | Dev server with HMR and a local Durable Object runtime       |
| `npm run dev:lan`       | Same, exposed on your local network for phones               |
| `npm test`              | Run both test suites once                                    |
| `npm run test:unit`     | Just the Node suite: the rules, in a third of a second       |
| `npm run test:workers`  | Just the workerd suite: the Durable Object and the API       |
| `npm run test:watch`    | Re-run affected tests as you edit                            |
| `npm run test:coverage` | Run with coverage, enforcing the thresholds                  |
| `npm run lint`          | ESLint: the hooks rules, mostly                              |
| `npm run build`         | Production build, then a type check                          |
| `npm run preview`       | Build, then serve the output as it will be deployed          |
| `npm run deploy`        | Build and deploy to Cloudflare                               |
| `npm run typecheck`     | Regenerate binding types, then check                         |
| `npm run typegen`       | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |
| `npm run format`        | Prettier                                                     |

### Testing

```bash
npm test
```

Tests sit next to the code they cover, and there are two suites because the code divides in two.

Most of the repo is decision-making with its effects pushed out — functions over plain objects that import nothing from `cloudflare:workers`. Those are `*.test.ts` and run in plain Node, which is a deliberate consequence of the architecture: moving sockets, storage and alarms out into `Room.ts` is what left the rules underneath testable without a runtime. All 269 of them finish in about a third of a second.

`Room.ts` is the other half, and it is the effects themselves: hibernation, the socket set, attachments that outlive memory, the single alarm slot. Those are `*.workers.test.ts` and run on real workerd under `@cloudflare/vitest-plugin`, against the same `wrangler.jsonc` the app deploys with.

```bash
npm run test:unit      # the fast half
npm run test:workers   # the runtime half
```

What is covered, at 97% of statements and 96% of branches:

| Area                                    | What the tests pin down                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `games/word-wall/server.ts`             | the game's rules: submissions, overwrites, early end, prompts, deadline, the withheld view    |
| `games/crowd-favourite/server.ts`       | voting rules, anonymity, shuffling, per-round scoring, and the phase transitions between them |
| `games/hot-potato/server.ts`            | turn order, repeats, elimination, the challenge duel, and not stalling on a dropped phone     |
| `worker/room/join.ts`                   | the security boundary: host token, name collisions, capacity, seat reclamation                |
| `worker/room/projection.ts`             | that a viewer only ever receives what that viewer is allowed to see                           |
| `worker/room/commands.ts`               | platform-vs-game routing, the start-gate, and the outcome mapping                             |
| `worker/room/{state,alarms}.ts`         | presence, ghost pruning, and the alarm multiplexing                                           |
| `shared/validation.ts`, `engine/ids.ts` | everything that narrows untrusted input                                                       |
| `worker/room/Room.ts`                   | hibernation, fan-out, the heartbeat, disconnects, and both alarm paths                        |
| `worker/index.ts`                       | the API contract the browser reads: codes, statuses, upgrades                                 |

Four choices worth knowing:

**The platform is tested against a fake game, not a real one.** `worker/room/testing.ts` defines a stand-in with different phases, commands and view shape. Testing the room with a real game would prove the room works with _that_ game, and would let one game's assumptions leak back into `worker/room/` unnoticed. The fake is what actually holds the abstraction honest.

**The secret-keeping rules are tested as invariants, not as snapshots.** Asserting an expected payload would pass just as happily if a later change added an author field to it. Instead the tests assert the exact key sets of a ballot entry and of a standings row, that two players receive different `yourCandidateId`s, and that a player's own answer never appears in anyone else's view. Each of these was checked by breaking it on purpose: allowing a self-vote, publishing the whole vote map, attaching names to candidates, skipping the shuffle and forgetting the used-prompt list all fail the suite.

**Coverage says a line ran, not that a test would notice it changing.** Each game's suite was checked by mutating the source and confirming the tests go red — 23 deliberate breakages for Hot Potato alone, including allowing a self-challenge, letting a lost challenge cost nobody their place, resolving ties against the answerer, publishing the votes map, skipping the shuffle, advancing turns into eliminated players, and removing the rule that puts a disconnected player out.

Two of those runs paid for the exercise:

- In Crowd Favourite, the eligibility filter in `everyoneVoted` turned out to be unreachable — voting is only entered with two or more entries and nobody writes twice, so no input could tell it apart from its own absence. It was deleted and replaced with a test asserting the invariant that made it redundant.
- In Hot Potato, the suite was at 100% on every metric and still could not tell `scores[id] = (scores[id] ?? 0) + POINTS_PER_ANSWER` from `scores[id] = POINTS_PER_ANSWER`, because no test had the same player answer twice in one round. Full coverage, real bug. A test for a second accepted answer closed it.

**The Durable Object is tested on workerd, not against a fake of it.** Writing a stand-in for `DurableObjectState` would have been faster and would have tested the wrong thing: `Room.ts` is almost entirely runtime behaviour, so a fake would assert our model of hibernation rather than hibernation. The model is the part most likely to be wrong. So the suite evicts the object mid-game with `evictDurableObject` and checks that a phone connected before the eviction is still recognised afterwards — which only works because the attachment lives on the socket rather than in an instance field.

These were mutation-checked too. Removing `attach()` fails ten tests; making the constructor skip its reload from storage fails five; deleting the superseded-socket guard in `handleDisconnect` fails exactly the one test written for it; and sending every socket the host's snapshot instead of its own fails only the per-viewer test. Four lines remain uncovered and are left that way on purpose: an internal-error handler, the 503 after eight consecutive code collisions, `webSocketError`, and one null-coalescing fallback. Each needs a failure that cannot be provoked from outside.

**Coverage is an allow-list.** `vitest.config.ts` names the modules these suites can meaningfully cover, rather than measuring the whole repo. A number that drops whenever someone adds a React component is a number people learn to ignore. Still not covered, and honest about it: the React layer, which needs jsdom and testing-library, and `worker/codes.ts`, where a test would assert the alphabet back at itself.

One constraint worth recording, since it shapes the config: the Workers plugin is pinned to Vitest 4, so the repo is too. Coverage there also has to come from Istanbul rather than V8, because V8 collects through `node:inspector`, which workerd does not implement — with V8 the Workers half of the suite is silently skipped.

### Continuous Integration

`.github/workflows/ci.yml` has two jobs. **Verify** runs on every push to `main` and every pull request:

| Step           | Command                         |
| -------------- | ------------------------------- |
| Binding types  | `npm run typegen`               |
| Format         | `npx prettier --check .`        |
| Lint           | `npx eslint . --max-warnings 0` |
| Types          | `npx tsc --noEmit`              |
| Tests          | `npm run test:coverage`         |
| Build          | `npx vite build`                |
| Deploy dry run | `npx wrangler deploy --dry-run` |

Three details that are load-bearing:

- **Typegen runs first.** `worker-configuration.d.ts` is generated from `wrangler.jsonc` and is not committed, but `tsconfig.json` references it — so nothing type-aware can run before it exists.
- **Lint is a separate step from types because it catches a different class of thing.** `tsc` already runs with `strict`, `noUnusedLocals` and `noUnusedParameters`, so ESLint is not here for unused variables. It is here for the React rules a type checker cannot see — stale dependency lists, `setState` in an effect body, hooks called conditionally. It found three real instances of the last kind on its first run, all since fixed rather than silenced.
- **Steps use `if: ${{ !cancelled() }}`,** so one failure does not hide the others. Seeing every problem at once beats discovering them one push at a time.
- **The dry-run deploy needs no credentials** and catches config-only breakage — a bad binding, a broken migration — that a build cannot see.

The coverage report is uploaded as an artifact on every run.

**Deploy** then runs only for a push to `main`, and only if Verify was green — `needs: verify` is what enforces that, since the run-past-failure trick above makes the job red rather than stopping it. Pull requests never reach it.

It rebuilds rather than reusing Verify's output: Wrangler needs `node_modules` in that job regardless, and the build takes under a second, so an artifact hand-off would add more moving parts than it saves. It skips `typegen` for the same kind of reason — that only emits types for `tsc`, which has already run, and neither the build nor the deploy reads them.

It runs `npx wrangler deploy` rather than `cloudflare/wrangler-action`, so the deploy uses the Wrangler version pinned in `package.json` — the same binary and the same command that passed the dry run, minus the flag. It also keeps a third-party action out of the release path.

**Setting it up on a fork.** One repository secret is required, under **Settings → Secrets and variables → Actions**:

| Secret                 | Value                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | An API token with the **Edit Cloudflare Workers** template, scoped to your account only |

No `CLOUDFLARE_ACCOUNT_ID` secret is needed, because `wrangler.jsonc` pins `account_id` — it is an identifier, not a credential. If the token is missing the job fails on its first step with a message saying so, rather than somewhere inside Wrangler with an authentication error that never mentions the secret.

### Deploying

```bash
npx wrangler login
npm run deploy
```

Deploying by hand is rarely necessary now: a green push to `main` ships automatically via the Deploy job above. The commands are here for a first deploy from a fresh clone, or for getting a fix out while CI is unavailable.

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

Read top to bottom, this is the platform/game split as directories: `shared/` and `worker/` and `src/` know about rooms, `games/` knows about play, and `engine/` is the contract between them.

```
hubbub/
├── .github/workflows/ci.yml   # Format, types, tests, build, dry-run deploy
├── shared/                    # Platform wire contract — no game knows it exists
│   ├── protocol.ts            #   state, messages, limits; worker AND client import it
│   └── validation.ts          #   enforcement, run on both sides
├── engine/                    # What a game must provide. No game logic of its own
│   ├── ids.ts                 #   the set of known game ids
│   ├── server.ts              #   GameDefinition: create/apply/deadline/view
│   ├── client.ts              #   GameClient: HostView + PlayerView
│   └── testing.ts             #   seat/actor/viewer helpers for any game's tests
├── games/
│   ├── server.ts              # Registry of server halves (worker bundle)
│   ├── client.ts              # Registry of client halves (browser bundle)
│   ├── word-wall/             # One self-contained game
│   │   ├── shared.ts          #   its view, commands and limits
│   │   ├── prompts.ts         #   its prompt list
│   │   ├── server.ts          #   its rules
│   │   └── client/            #   its two screens, and the pieces they use
│   ├── crowd-favourite/       # Same shape, nothing shared with the other games
│   │   ├── shared.ts          #   a view type per phase, so a screen cannot
│   │   │                      #   read a field that phase does not have
│   │   ├── prompts.ts         #   its prompt list
│   │   ├── server.ts          #   voting, anonymity and scoring
│   │   └── client/            #   write form, ballot, results, scoreboard
│   └── hot-potato/            # Same shape again. The turn-based one
│       ├── shared.ts          #   a Stage union: no "reviewing" without an
│       │                      #   answer to review, so no impossible branches
│       ├── categories.ts      #   its category list
│       ├── server.ts          #   turn order, elimination, the challenge duel
│       └── client/            #   turn circle, answer form, verdict buttons
├── worker/
│   ├── index.ts               # Worker entry: asset serving + API routing
│   ├── codes.ts               # CSPRNG room codes and host tokens
│   └── room/                  # The Room Durable Object, split by concern
│       ├── Room.ts            #   lifecycle, effects, delegation to the game
│       ├── state.ts           #   the room as data + its legal transformations
│       ├── storage.ts         #   the only code that knows how a room persists
│       ├── sockets.ts         #   attachments, tagging, best-effort sends
│       ├── presence.ts        #   connectivity derived from the live socket set
│       ├── credentials.ts     #   constant-time token comparison
│       ├── join.ts            #   who is connecting: the security boundary
│       ├── commands.ts           #   routes a message to the platform or the game
│       ├── projection.ts         #   builds the snapshot for one viewer
│       ├── alarms.ts             #   multiplexes game deadline vs. room expiry
│       ├── testing.ts            #   a fake game, so the room is tested game-agnostically
│       └── testing-socket.ts     #   drives a room over a real socket, for the workerd suite
├── src/
│   ├── main.tsx               # React entry
│   ├── App.tsx                # Route switch
│   ├── index.css              # Tailwind theme: colour, easing, keyframes
│   ├── screens/
│   │   ├── home/              #   pick a game and host, or join one by code
│   │   ├── host/              #   the shared screen: chrome, lobby, handover
│   │   └── player/            #   the phone: name form, waiting room, handover
│   ├── components/
│   │   ├── ui/                #   one primitive per file, plus stagger()
│   │   ├── feedback/          #   loading and notice screens
│   │   └── QrCode.tsx         #   join QR for the host screen
│   ├── hooks/
│   │   ├── useRoomSocket.ts   #   reconnecting socket: backoff, heartbeat, outbox
│   │   ├── useCountdown.ts    #   deadline countdown
│   │   ├── useRouter.ts       #   minimal history router
│   │   └── useHomeActions.ts  #   create/join flows
│   └── lib/
│       ├── connection.ts      #   the vocabulary for "a live connection"
│       ├── session.ts         #   player ID, host token and name persistence
│       ├── routes.ts          #   route parsing
│       ├── urls.ts            #   socket and join URLs
│       └── api.ts             #   REST calls
├── index.html
├── wrangler.jsonc             # Worker config, DO binding, asset rules
├── vite.config.ts
├── vitest.config.ts           # Two projects: node rules, workerd effects
├── tsconfig.json
└── .npmrc                     # Pins @cloudflare to the public registry
```

Tests live beside the code and are omitted above: `*.test.ts` for the rules, which run in Node, and `*.workers.test.ts` for the effects, which run on workerd.

**Adding a game**

1. Add its id to `engine/ids.ts`.
2. Write `games/<id>/shared.ts`, a `GameDefinition` and a `GameClient`.
3. Register it in `games/server.ts` and `games/client.ts`.
4. Add its server-side files to the coverage allow-list in `vitest.config.ts`.

Nothing in `shared/`, `worker/` or `src/` changes, and the game picker on the home screen fills itself in from the client registry. Adding Crowd Favourite touched the platform only to make the two engine changes described above — both additions, neither specific to it.

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
- [x] Elimination, a challenge mechanic, and not stalling on the player whose turn it is
- [x] The Durable Object under test on real workerd, hibernation included
- [ ] Round history and an end-of-game summary
- [ ] Sound and animation on the host screen
- [ ] Reconnect as host after closing the TV tab
- [ ] A fourth game that needs teams, or hidden roles

The engine has now run three games that work differently, which moved its seams from a hypothesis to something with evidence behind it. The second game needed two additions; the third, chosen specifically because it is turn-based where the others are simultaneous, needed none — see [What the second game did to the engine](#architecture) and the section after it.

The next useful test is probably a game with **teams or hidden roles**, since all three so far treat every player as an identical, independent seat. Nothing in the engine has yet had to express that two players are on the same side, or that one of them knows something the others do not from the moment the game starts. Host reconnection is the other outstanding gap, and it is a design question before it is a coding one: the host token deliberately lives in `sessionStorage` so hosting cannot leak into a new tab, which also means closing the tab ends the room.

## Author

Built by [Francisca Portugal](https://github.com/franpts2).
