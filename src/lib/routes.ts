/**
 * The route table, as plain data.
 *
 * This app has three screens and no nested layouts, so a routing library
 * would be more configuration than code. Parsing and serialising live here as
 * pure functions; the React binding is `hooks/useRouter`.
 */

import { normalizeCode } from "../../shared/validation";

export type Route =
  { name: "home" } | { name: "host"; code: string } | { name: "join"; code: string };

export type Navigate = (route: Route, replace?: boolean) => void;

export function parseRoute(pathname: string): Route {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 2) {
    const code = normalizeCode(segments[1]);
    if (code !== null && (segments[0] === "host" || segments[0] === "join")) {
      return { name: segments[0], code };
    }
  }
  return { name: "home" };
}

export function routeToPath(route: Route): string {
  switch (route.name) {
    case "home":
      return "/";
    case "host":
      return `/host/${route.code}`;
    case "join":
      return `/join/${route.code}`;
  }
}
