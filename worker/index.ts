import { normalizeCode } from "../shared/validation";
import { generateCode } from "./codes";
import { Room } from "./room";

export { Room };

const CREATE_ATTEMPTS = 8;

/**
 * The Worker is a thin router. It serves the built React app, mints room
 * codes, and hands WebSocket upgrades to the right Durable Object. All the
 * game logic lives in the Room DO.
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await route(request, env, url);
      } catch (error) {
        console.error("Unhandled API error", error);
        return Response.json({ error: "internal_error" }, { status: 500 });
      }
    }

    // `run_worker_first` means assets normally never reach us, but keep the
    // fallback so the Worker is correct on its own.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const segments = url.pathname.split("/").filter(Boolean); // ["api", "rooms", ...]

  if (segments[1] !== "rooms") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // POST /api/rooms -> create a room
  if (segments.length === 2) {
    if (request.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }
    return createRoom(env);
  }

  const code = normalizeCode(segments[2]);
  if (code === null) {
    return Response.json({ error: "bad_code" }, { status: 400 });
  }

  // GET /api/rooms/:code -> does it exist? Lets the join form fail fast with a
  // readable message instead of a cryptic WebSocket error.
  if (segments.length === 3) {
    if (request.method !== "GET") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }
    const exists = await env.ROOM.getByName(code).exists();
    return Response.json({ exists }, { status: exists ? 200 : 404 });
  }

  // GET /api/rooms/:code/ws -> WebSocket upgrade, forwarded to the room
  if (segments.length === 4 && segments[3] === "ws") {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    return env.ROOM.getByName(code).fetch(request);
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}

async function createRoom(env: Env): Promise<Response> {
  // Codes are short enough that collisions are possible once a lot of rooms
  // are live, so retry rather than handing back a code someone else owns.
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = generateCode();
    const result = await env.ROOM.getByName(code).tryCreate(code);
    if (result.ok) {
      return Response.json({ code, hostToken: result.hostToken });
    }
  }
  return Response.json({ error: "no_codes_available" }, { status: 503 });
}
