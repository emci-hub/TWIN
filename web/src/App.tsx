import { useHashRoute } from "./lib/useHashRoute";
import { useTheme } from "./lib/useTheme";
import { useSession } from "./lib/SessionContext";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Home } from "./screens/Home";
import { Quiz } from "./screens/Quiz";
import { Results } from "./screens/Results";
import { Why } from "./screens/Why";
import { Chat } from "./screens/Chat";
import { SocialRead } from "./screens/SocialRead";
import { Settings } from "./screens/Settings";

function App() {
  const [screen, navigate] = useHashRoute();
  const [theme, toggleTheme] = useTheme();
  const { error } = useSession();

  return (
    <div className="app-root">
      <Sidebar active={screen} onNavigate={navigate} />
      <div className="main">
        <Topbar screen={screen} theme={theme} onToggleTheme={toggleTheme} />
        <div className="content">
          {error && screen !== "quiz" && screen !== "settings" && (
            <div className="banner banner-error">{error}</div>
          )}
          {screen === "home" && <Home onNavigate={navigate} />}
          {screen === "quiz" && <Quiz onNavigate={navigate} />}
          {screen === "results" && <Results />}
          {screen === "why" && <Why />}
          {screen === "chat" && <Chat />}
          {screen === "social-read" && <SocialRead />}
          {screen === "settings" && <Settings />}
        </div>
      </div>
    </div>
  );
}

export default App;
