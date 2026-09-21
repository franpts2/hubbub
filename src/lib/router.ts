import { useCallback, useEffect, useState } from "react";

import { normalizeCode } from "../../shared/protocol";

/**
 * A ~30 line router. This app has three screens and no nested layouts, so
 * pulling in a routing library would be more configuration than code.
 */
export type Route =
  | { name: "home" }
  | { name: "host"; code: string }
  | { name: "join"; code: string };

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

export function useRouter() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: Route, replace = false) => {
    const path = routeToPath(next);
    if (replace) history.replaceState(null, "", path);
    else history.pushState(null, "", path);
    setRoute(next);
  }, []);

  return { route, navigate };
}
