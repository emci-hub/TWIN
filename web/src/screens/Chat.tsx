import { useState } from "react";
import { useSession } from "../lib/SessionContext";
import { api, ApiError } from "../lib/api";
import { getStoredProvider } from "../lib/storage";
import { TWIN_CHAT_MAX_MESSAGE_LENGTH } from "../lib/constants";
import { hasAnyEvidence } from "../lib/profileMath";

interface Bubble {
  role: "user" | "twin" | "system";
  text: string;
}

export function Chat() {
  const { sessionId, name, profile } = useSession();
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const canChat = hasAnyEvidence(profile);

  async function send() {
    const text = draft.trim();
    if (!text || !sessionId || sending) return;
    setDraft("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setSending(true);
    try {
      const provider = getStoredProvider();
      const result = await api.chat(sessionId, text, provider);
      setMessages((prev) => [...prev, { role: "twin", text: result.reply }]);
    } catch (err) {
      const text =
        err instanceof ApiError
          ? err.message
          : "Couldn't reach the twin's AI provider — try again shortly.";
      setMessages((prev) => [...prev, { role: "system", text }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <h1 className="screen-title">{name ? `Chat with ${name}'s twin` : "Chat with your twin"}</h1>
      <div className="chat-disclaimer">
        This is a hedged approximation built from quiz answers — not a real person, and not a
        diagnosis. It can be wrong.
      </div>

      {!canChat && (
        <div className="card empty-card">
          <div className="empty-title">No profile yet</div>
          <div className="empty-sub">Answer the Quick Start quiz first — the twin needs at least a rough profile to speak from.</div>
        </div>
      )}

      {canChat && (
        <div className="card">
          <div className="chat-scroll">
            {messages.length === 0 && (
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                Say something to get started.
              </p>
            )}
            {messages.map((m, i) => (
              <div className={`bubble ${m.role}`} key={i}>
                {m.text}
              </div>
            ))}
            {sending && <div className="bubble twin">…</div>}
          </div>
          <div className="chat-input-row">
            <input
              type="text"
              placeholder="Message the twin…"
              value={draft}
              maxLength={TWIN_CHAT_MAX_MESSAGE_LENGTH}
              disabled={sending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button className="btn btn-primary" disabled={sending || !draft.trim()} onClick={send}>
              Send
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
