import type { Theme } from "../lib/useTheme";

const TITLES: Record<string, string> = {
  home: "Home",
  quiz: "Quiz",
  results: "Results",
  why: '"Why" trail',
  chat: "Twin chat",
  settings: "Settings",
};

export function Topbar({
  screen,
  theme,
  onToggleTheme,
}: {
  screen: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <div className="topbar">
      <div className="topbar-title">{TITLES[screen] ?? screen}</div>
      <div className="topbar-right">
        <span className="pill">Anonymous session — stored on this device only</span>
        <button className="theme-btn" onClick={onToggleTheme}>
          {theme === "dark" ? "○ Minimal" : "✦ Neon"}
        </button>
      </div>
    </div>
  );
}
