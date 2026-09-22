/**
 * The Worker's API surface, on the real runtime.
 *
 * Small on purpose: the router is a dozen branches, and every one of them is
 * a contract the browser depends on. The pre-flight check on the join form
 * reads the 404 from `GET /api/rooms/:code`, and the host screen reads the
 * code and token out of `POST /api/rooms`, so getting a status wrong here
 * breaks the app in a way no unit test of the room would catch.
 */

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { DEFAULT_GAME_ID } from "../engine/ids";
import { connectHost, createRoom } from "./room/testing-socket";

const ORIGIN = "https://hubbub.test";

const post = (path: string, body?: unknown) =>
  SELF.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const get = (path: string) => SELF.fetch(`${ORIGIN}${path}`);

describe("POST /api/rooms", () => {
  it("mints a code and a host token", async () => {
    const response = await post("/api/rooms", {});

    expect(response.status).toBe(200);
    const body = (await response.json()) as { code: string; hostToken: string };
    expect(body.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(body.hostToken).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("binds the room to the game that was asked for", async () => {
    const { code, hostToken } = await createRoom("hot-potato");

    const host = await connectHost(code, hostToken);

    expect((await host.welcomed()).state.gameId).toBe("hot-potato");
  });

  /** A bad body should not stop a party, so it falls back rather than failing. */
  it("falls back to the default game for an unknown id", async () => {
    const response = await post("/api/rooms", { gameId: "buzzword-bingo" });
    const { code, hostToken } = (await response.json()) as {
      code: string;
      hostToken: string;
    };

    const host = await connectHost(code, hostToken);

    expect((await host.welcomed()).state.gameId).toBe(DEFAULT_GAME_ID);
  });

  it("falls back to the default game when the body is not JSON at all", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/rooms`, {
      method: "POST",
      body: "{ not json",
    });
    const { code, hostToken } = (await response.json()) as {
      code: string;
      hostToken: string;
    };

    const host = await connectHost(code, hostToken);

    expect((await host.welcomed()).state.gameId).toBe(DEFAULT_GAME_ID);
  });

  it("rejects any other method", async () => {
    const response = await get("/api/rooms");

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: "method_not_allowed" });
  });
});

describe("GET /api/rooms/:code", () => {
  it("confirms a room that exists", async () => {
    const { code } = await createRoom();

    const response = await get(`/api/rooms/${code}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ exists: true });
  });

  /** The join form reads this 404 to say "no room with that code" up front. */
  it("404s a code nobody has claimed", async () => {
    // Storage is shared across the Workers suite, so a hard-coded code has to
    // be unique to this file. Every other room here is minted at random.
    const response = await get("/api/rooms/ZZZY");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ exists: false });
  });

  it("accepts a code typed in lower case", async () => {
    const { code } = await createRoom();

    const response = await get(`/api/rooms/${code.toLowerCase()}`);

    expect(await response.json()).toEqual({ exists: true });
  });

  it("400s a code that could never be real", async () => {
    // I, O, 0 and 1 are deliberately not in the alphabet.
    for (const code of ["ABC", "ABCDE", "AB0O"]) {
      const response = await get(`/api/rooms/${code}`);
      expect(response.status, code).toBe(400);
      expect(await response.json()).toEqual({ error: "bad_code" });
    }
  });

  it("rejects any other method", async () => {
    const { code } = await createRoom();

    const response = await post(`/api/rooms/${code}`);

    expect(response.status).toBe(405);
  });
});

describe("routing", () => {
  it("426s a socket upgrade that forgot to say so", async () => {
    const { code } = await createRoom();

    const response = await get(`/api/rooms/${code}/ws`);

    expect(response.status).toBe(426);
  });

  it("404s a path under a room that is not the socket", async () => {
    const { code } = await createRoom();

    expect((await get(`/api/rooms/${code}/players`)).status).toBe(404);
    expect((await get(`/api/rooms/${code}/ws/extra`)).status).toBe(404);
  });

  it("404s an API path that is not about rooms", async () => {
    const response = await get("/api/games");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
