import { useState } from "react";

import { loadName } from "../../lib/session";
import { NameForm } from "./NameForm";
import { PlayerRoom } from "./PlayerRoom";

/**
 * The phone. Deliberately one job per screen — nobody reads UI at a party.
 *
 * This component owns only the gate: you cannot connect without a name, so
 * everything socket-related lives behind `PlayerRoom`.
 */
export function PlayerScreen({ code, onExit }: { code: string; onExit: () => void }) {
  const [name, setName] = useState<string | null>(() => loadName(code));

  if (name === null) {
    return <NameForm code={code} onPick={setName} onBack={onExit} />;
  }

  return (
    <PlayerRoom code={code} name={name} onLeave={onExit} onRename={() => setName(null)} />
  );
}
