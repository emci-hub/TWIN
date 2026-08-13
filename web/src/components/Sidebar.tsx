import type { ScreenId } from "../lib/useHashRoute";
import { useSession } from "../lib/SessionContext";

interface NavItem {
  id: ScreenId;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Only the screens this phase actually built. docs/mockup.html also shows
 * Guess-your-twin, Feedback, Multiplayer, and System overview — those stay
 * mockup-only until their own post-MVP phases (docs/BUILD.md's "After the
 * MVP" table) actually build them, rather than shipping nav links to
 * screens with no real functionality behind them. "AI read" below is the
 * real, built version of what the mockup called Social upload — kept in
 * its own nav group, deliberately separate from "See it" (the quiz-based
 * profile), so it never reads as part of the twin's real profile.
 */
function quizLabel(phase: string | null, done: boolean): string {
  if (done) return "Quiz complete";
  if (phase === "sharpen") return "Sharpen batch";
  return "Quick Start quiz";
}

const GROUPS: (quizLabel: string) => NavGroup[] = (quizLabel) => [
  { label: "", items: [{ id: "home", label: "Home" }] },
  { label: "Build a profile", items: [{ id: "quiz", label: quizLabel }] },
  {
    label: "See it",
    items: [
      { id: "results", label: "Results" },
      { id: "why", label: '"Why" trail' },
      { id: "chat", label: "Twin chat" },
    ],
  },
  { label: "Try something new", items: [{ id: "social-read", label: "AI read" }] },
  { label: "Manage", items: [{ id: "settings", label: "Settings" }] },
];

export function Sidebar({
  active,
  onNavigate,
}: {
  active: ScreenId;
  onNavigate: (id: ScreenId) => void;
}) {
  const { phase, done } = useSession();
  const groups = GROUPS(quizLabel(phase, done));

  return (
    <nav className="sidebar">
      <div className="brand">
        <div className="brand-mark" />
        <div className="brand-name">TwinArchitect</div>
      </div>

      {groups.map((group) => (
        <div key={group.label || "root"}>
          {group.label && <div className="nav-group-label">{group.label}</div>}
          {group.items.map((item) => (
            <button
              key={item.id}
              className={`nav-item${active === item.id ? " active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="dot" />
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
