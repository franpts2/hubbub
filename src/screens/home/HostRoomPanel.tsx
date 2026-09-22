import { Button, Eyebrow, Panel } from "../../components/ui";

export function HostRoomPanel({
  pending,
  disabled,
  onHost,
}: {
  pending: boolean;
  disabled: boolean;
  onHost: () => void;
}) {
  return (
    <Panel>
      <Eyebrow as="h2">On a TV or laptop</Eyebrow>
      <p className="mt-2 mb-4 text-sm text-muted">
        Open the shared screen everyone can see.
      </p>
      <Button onClick={onHost} disabled={disabled} className="w-full">
        {pending ? "Creating…" : "Start a room"}
      </Button>
    </Panel>
  );
}
