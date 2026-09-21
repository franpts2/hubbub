import { useRouter } from "./lib/router";
import { Home } from "./screens/Home";
import { HostScreen } from "./screens/HostScreen";
import { PlayerScreen } from "./screens/PlayerScreen";

export function App() {
  const { route, navigate } = useRouter();

  switch (route.name) {
    case "host":
      return <HostScreen code={route.code} navigate={navigate} />;
    case "join":
      return <PlayerScreen code={route.code} navigate={navigate} />;
    case "home":
      return <Home navigate={navigate} />;
  }
}
