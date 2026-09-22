import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * Two suites, because the code under test divides cleanly in two.
 *
 * Most of this repo is decision-making with its effects pushed out: functions
 * that take plain objects and return plain objects, importing nothing from
 * `cloudflare:workers`. Node is a faithful host for those, and a fast one —
 * the whole unit suite runs in well under a second.
 *
 * `Room.ts` is the other half. It *is* the effects: hibernation, the socket
 * set, attachments that outlive memory, the single alarm slot. A hand-written
 * fake of those would assert our model of workerd rather than workerd, and the
 * model is the thing most likely to be wrong — so that half runs on the real
 * runtime, under `@cloudflare/vitest-plugin`, against the real
 * `wrangler.jsonc`.
 *
 * Files ending `.workers.test.ts` want the runtime; plain `.test.ts` does not.
 *
 * Deliberately not reusing `vite.config.ts`: that config exists to *build* the
 * app, so it carries the React, Tailwind and Cloudflare plugins. The unit
 * suite needs none of them.
 */

const WORKERS_TESTS = "**/*.workers.test.ts";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["{shared,engine,games,worker}/**/*.test.ts"],
          exclude: [WORKERS_TESTS],
          // Runs first: it is the faster of the two by two orders of
          // magnitude, so a broken rule should not wait on a runtime to boot.
          sequence: { groupOrder: 0 },
        },
      },

      {
        plugins: [
          cloudflareTest({
            // The same config the thing deploys with, so the test runs
            // against the real DO binding and migrations rather than a
            // second description of them that can drift.
            wrangler: { configPath: "./wrangler.jsonc" },
          }),
        ],
        test: {
          name: "workers",
          include: [WORKERS_TESTS],
          /**
           * Hibernatable WebSockets on a Durable Object are not supported
           * alongside Vitest's per-file storage isolation, which is a
           * documented limitation of the plugin rather than a choice. Sharing
           * one storage instance across the files is the sanctioned way
           * around it.
           *
           * The consequence: rooms outlive the file that made them. Almost
           * every test mints a random code and is unaffected, but a test that
           * hard-codes one has to pick a code no other file uses.
           */
          isolate: false,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],

    coverage: {
      /**
       * Istanbul rather than V8, which is not a preference.
       *
       * V8's coverage is collected through `node:inspector`, which workerd
       * does not implement, so it cannot see inside the Workers project at
       * all. Istanbul instruments at transform time and therefore works in
       * both. The cost is a slower run; the alternative is a number that
       * silently ignores half the suite.
       */
      provider: "istanbul",
      reporter: ["text", "html"],

      /**
       * An allow-list, not the whole repo.
       *
       * Coverage is only honest about code that *can* be covered by these
       * suites. Listing the rest would produce a number that goes down when
       * someone adds a component, which teaches people to ignore it.
       *
       * Left out on purpose:
       *   - `worker/codes.ts` — a CSPRNG wrapper; a test would assert the
       *     alphabet back at itself.
       *   - `src/**` and `games/**\/client/**` — React. Covering these needs
       *     jsdom and testing-library, which is a separate decision.
       */
      include: [
        "shared/validation.ts",
        "engine/ids.ts",
        "games/word-wall/server.ts",
        "games/word-wall/prompts.ts",
        "games/word-wall/shared.ts",
        "games/crowd-favourite/server.ts",
        "games/crowd-favourite/prompts.ts",
        "games/crowd-favourite/shared.ts",
        "games/hot-potato/server.ts",
        "games/hot-potato/categories.ts",
        "games/hot-potato/shared.ts",
        "worker/room/state.ts",
        "worker/room/commands.ts",
        "worker/room/projection.ts",
        "worker/room/alarms.ts",
        "worker/room/join.ts",
        "worker/room/credentials.ts",
        // Covered by the Workers project rather than the unit one.
        "worker/room/Room.ts",
        "worker/room/sockets.ts",
        "worker/room/presence.ts",
        "worker/room/storage.ts",
        "worker/index.ts",
      ],

      /**
       * Set just under the current 100% so a genuinely awkward branch does not
       * block a commit, while a real gap still fails the build. Raise the
       * floor rather than lowering it.
       */
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
