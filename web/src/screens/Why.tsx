import { useEffect, useState } from "react";
import { useSession } from "../lib/SessionContext";
import { useDimensions } from "../lib/useDimensions";

export function Why() {
  const { answers, loading } = useSession();
  const dimensions = useDimensions();
  const [selectedDim, setSelectedDim] = useState<string>("");

  useEffect(() => {
    if (!selectedDim && dimensions.length > 0) {
      setSelectedDim(dimensions[0].id);
    }
  }, [dimensions, selectedDim]);

  if (loading) {
    return (
      <section>
        <h1 className="screen-title">Why</h1>
        <div className="card">Loading…</div>
      </section>
    );
  }

  const meta = dimensions.find((d) => d.id === selectedDim);
  const evidence = answers
    .map((a) => ({
      answer: a,
      target: a.targets.find((t) => t.dim === selectedDim),
    }))
    .filter((row): row is { answer: typeof answers[number]; target: NonNullable<typeof row.target> } =>
      Boolean(row.target),
    );

  return (
    <section>
      <h1 className="screen-title">Why{meta ? `: ${meta.label}` : ""}</h1>
      <p className="screen-sub">Every trait traces back to the answers that produced it.</p>

      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Dimension
        </div>
        <select
          value={selectedDim}
          onChange={(e) => setSelectedDim(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 9,
            border: "1px solid var(--border)",
            background: "var(--page)",
            color: "var(--text-primary)",
            fontSize: 13.5,
          }}
        >
          {dimensions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {evidence.length === 0 && (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            No answers have touched this dimension yet.
          </p>
        )}
        {evidence.map(({ answer, target }) => (
          <div className="evidence-item" key={answer.question_id}>
            <div>
              <div className="evidence-text">
                “{answer.chosen_text}”{answer.prompt ? ` — ${answer.prompt}` : ""}
              </div>
              <div className="evidence-meta">
                {target.direction === "+" ? "+" : "−"} direction · weight: {target.strength} ·{" "}
                {new Date(answer.created_at).toLocaleString()}
              </div>
            </div>
            <span className="chip">{answer.source}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
