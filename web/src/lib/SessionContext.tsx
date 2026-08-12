import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  api,
  ApiError,
  type Profile,
  type Question,
  type ResolvedAnswer,
  type StopReason,
} from "./api";
import {
  clearStoredSessionId,
  getStoredName,
  getStoredSessionId,
  setStoredName,
  setStoredSessionId,
} from "./storage";

interface SessionContextValue {
  sessionId: string | null;
  name: string;
  profile: Profile | null;
  phase: "quick_start" | "sharpen" | "done" | null;
  batch: Question[];
  done: boolean;
  stopReason: StopReason;
  frozen: boolean;
  answers: ResolvedAnswer[];
  roundSize: number;
  loading: boolean;
  error: string | null;
  setName: (name: string) => void;
  submitAnswer: (questionId: string, optionId: string) => Promise<void>;
  refresh: () => Promise<void>;
  freeze: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [name, setNameState] = useState<string>(() => getStoredName());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phase, setPhase] = useState<"quick_start" | "sharpen" | "done" | null>(null);
  const [batch, setBatch] = useState<Question[]>([]);
  const [done, setDone] = useState(false);
  const [stopReason, setStopReason] = useState<StopReason>(null);
  const [frozen, setFrozen] = useState(false);
  const [answers, setAnswers] = useState<ResolvedAnswer[]>([]);
  const [roundSize, setRoundSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyState = useCallback(
    (state: {
      profile: Profile;
      phase: "quick_start" | "sharpen" | "done";
      batch: Question[];
      done: boolean;
      stop_reason: StopReason;
      frozen?: boolean;
      answers?: ResolvedAnswer[];
      round_size: number;
    }) => {
      setProfile(state.profile);
      setPhase(state.phase);
      setBatch(state.batch);
      setDone(state.done);
      setStopReason(state.stop_reason);
      setRoundSize(state.round_size);
      if (state.frozen !== undefined) setFrozen(state.frozen);
      if (state.answers !== undefined) setAnswers(state.answers);
    },
    [],
  );

  const refresh = useCallback(async () => {
    const id = sessionId ?? getStoredSessionId();
    if (!id) return;
    const state = await api.getSession(id);
    applyState(state);
  }, [sessionId, applyState]);

  // Bootstrap: resume a stored session, or start a fresh one.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setError(null);
      try {
        const existingId = getStoredSessionId();
        if (existingId) {
          try {
            const state = await api.getSession(existingId);
            if (cancelled) return;
            setSessionId(existingId);
            applyState(state);
            return;
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 404)) throw err;
            // stale/unknown session id — fall through and start a new one
            clearStoredSessionId();
          }
        }
        const state = await api.createSession();
        if (cancelled) return;
        setStoredSessionId(state.session_id);
        setSessionId(state.session_id);
        applyState(state);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "failed to reach the API");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setName = useCallback((value: string) => {
    setNameState(value);
    setStoredName(value);
  }, []);

  const submitAnswer = useCallback(
    async (questionId: string, optionId: string) => {
      if (!sessionId) return;
      setError(null);
      try {
        await api.answer(sessionId, questionId, optionId);
        // Re-fetch canonical state (includes the resolved answer trail the
        // "Why" screen needs) rather than hand-merging two response shapes.
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed to submit that answer");
        throw err;
      }
    },
    [sessionId, refresh],
  );

  const freeze = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    try {
      await api.freezeSession(sessionId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to freeze the profile");
      throw err;
    }
  }, [sessionId, refresh]);

  const value: SessionContextValue = {
    sessionId,
    name,
    profile,
    phase,
    batch,
    done,
    stopReason,
    frozen,
    answers,
    roundSize,
    loading,
    error,
    setName,
    submitAnswer,
    refresh,
    freeze,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
