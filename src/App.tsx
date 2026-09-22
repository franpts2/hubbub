import { useCallback } from "react";

import { useRouter } from "./hooks/useRouter";
import { HomeScreen } from "./screens/home/HomeScreen";
import { HostScreen } from "./screens/host/HostScreen";
import { PlayerScreen } from "./screens/player/PlayerScreen";

export function App() {
  const { route, navigate } = useRouter();

  // The host and player screens only ever leave to one place, so they get a
  // plain callback instead of the router. Neither needs to know routes exist.
  const goHome = useCallback(() => navigate({ name: "home" }), [navigate]);

  switch (route.name) {
    case "host":
      return <HostScreen code={route.code} onExit={goHome} />;
    case "join":
      return <PlayerScreen code={route.code} onExit={goHome} />;
    case "home":
      return <HomeScreen navigate={navigate} />;
  }
}
