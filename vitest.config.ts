import { defineConfig } from "vitest/config";

/**
 * Deliberately not reusing `vite.config.ts`.
 *
 * That config exists to *build* the app, so it carries the React, Tailwind and
 * Cloudflare plugins. Loading them to run tests would mean standing up an
 * asset pipeline and a workerd instance to exercise functions that take plain
 * objects and return plain objects.
 *
 * Everything covered here is pure by construction: the refactor pushed
 * sockets, storage and alarms out to `Room.ts`, so the rules underneath them
 * import nothing from `cloudflare:workers` and need no Workers globals. Node
 * is therefore a faithful host for them, and a fast one.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["{shared,engine,games,worker}/**/*.test.ts"],

    coverage: {
      provider: "v8",
      reporter: ["text", "html"],

      /**
       * An allow-list, not the whole repo.
       *
       * Coverage is only honest about code that *can* be covered by this
       * suite. Listing the rest would produce a number that goes down when
       * someone adds a component, which teaches people to ignore it.
       *
       * Everything here is decision-making logic with its effects pushed out.
       * Left out on purpose:
       *   - `worker/room/{Room,sockets,presence,storage}.ts` and
       *     `worker/index.ts` — these *are* the effects. They need a real
       *     Durable Object, so they want `@cloudflare/vitest-pool-workers`
       *     and a second project entry, not a node environment.
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
        "worker/room/state.ts",
        "worker/room/commands.ts",
        "worker/room/projection.ts",
        "worker/room/alarms.ts",
        "worker/room/join.ts",
        "worker/room/credentials.ts",
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
