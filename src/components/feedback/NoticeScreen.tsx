import type { ReactNode } from "react";

import { ErrorNote } from "../ui/ErrorNote";
import { Logo } from "../ui/Logo";
import { Screen } from "../ui/Screen";

/**
 * A dead end with a way out.
 *
 * Used for every state the app cannot recover from on its own — wrong device
 * for this room, room gone, name taken. `children` are the escape routes, laid
 * out as a row of buttons.
 */
export function NoticeScreen({
  message,
  children,
}: {
  message: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Screen className="items-center justify-center gap-6 text-center">
      <Logo className="text-4xl" />
      <ErrorNote>{message}</ErrorNote>
      {children ? (
        <div className="flex flex-wrap justify-center gap-3">{children}</div>
      ) : null}
    </Screen>
  );
}
