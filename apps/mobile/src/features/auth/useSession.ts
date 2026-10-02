import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/expo";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@ojarun/convex/api";

export type Me = NonNullable<ReturnType<typeof useMe>>;

/** The signed-in user's profile, or null/undefined while loading. */
export function useMe() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.users.me, isAuthenticated ? {} : "skip");
}

export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; me: Me };

/**
 * Resolves Clerk → Convex → our users row. Creates the row on first sign-in (ensureUser),
 * which always makes a customer; roles change only from ops (05 §5.2).
 */
export function useSession(): SessionState {
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);
  const me = useMe();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const run = () => {
    started.current = true;
    setFailed(false);
    ensureUser().catch(() => setFailed(true));
  };

  useEffect(() => {
    if (isAuthenticated && !started.current) run();
    if (!isSignedIn) started.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isSignedIn]);

  if (!isLoaded) return { status: "loading" };
  if (!isSignedIn) return { status: "signedOut" };
  if (failed) return { status: "error", retry: run };
  if (isLoading || !isAuthenticated || me === undefined || me === null) return { status: "loading" };
  return { status: "ready", me };
}
