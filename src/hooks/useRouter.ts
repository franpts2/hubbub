import { useCallback, useEffect, useState } from "react";

import { parseRoute, routeToPath, type Navigate, type Route } from "../lib/routes";

/** Binds the pure route table in `lib/routes` to the History API. */
export function useRouter(): { route: Route; navigate: Navigate } {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback<Navigate>((next, replace = false) => {
    const path = routeToPath(next);
    if (replace) history.replaceState(null, "", path);
    else history.pushState(null, "", path);
    setRoute(next);
  }, []);

  return { route, navigate };
}
