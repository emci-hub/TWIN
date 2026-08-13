import { useEffect, useState, useCallback } from "react";

export type ScreenId = "home" | "quiz" | "results" | "why" | "chat" | "social-read" | "settings";

const VALID: ScreenId[] = ["home", "quiz", "results", "why", "chat", "social-read", "settings"];
const DEFAULT_SCREEN: ScreenId = "home";

function readHash(): ScreenId {
  const raw = window.location.hash.replace(/^#/, "");
  return (VALID as string[]).includes(raw) ? (raw as ScreenId) : DEFAULT_SCREEN;
}

/**
 * Deliberately not a real router library — this is the same "one active
 * screen" model docs/mockup.html used, just backed by the URL hash instead
 * of a JS variable, so the active screen survives a page refresh (the
 * Phase 6 test: "a refresh mid-quiz keeps progress" needs you to land back
 * on the quiz screen, not bounce to Home).
 */
export function useHashRoute(): [ScreenId, (id: ScreenId) => void] {
  const [screen, setScreen] = useState<ScreenId>(() => readHash());

  useEffect(() => {
    const onHashChange = () => setScreen(readHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((id: ScreenId) => {
    if (window.location.hash.replace(/^#/, "") === id) {
      setScreen(id);
      return;
    }
    window.location.hash = id;
  }, []);

  return [screen, navigate];
}
