import { Button } from "@/components/ui/button";

import { logOutAction } from "../actions";

/**
 * A <form action> bound to a Server Action rather than a click handler —
 * "log out" doesn't need a dedicated page (nobody "visits" logging out);
 * this button lives in the nav and works without any client JS.
 */
export function LogOutButton() {
  return (
    <form action={logOutAction}>
      <Button type="submit" variant="ghost">
        Log out
      </Button>
    </form>
  );
}
