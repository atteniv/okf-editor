import { useEffect } from "react";
import "./App.css";
import { AiSettings } from "./AiSettings";
import { BundleView } from "./BundleView";
import { StartScreen } from "./StartScreen";
import { useStore } from "./store";

function App() {
  const view = useStore((state) => state.view);
  const settingsOpen = useStore((state) => state.settingsOpen);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const refreshAiStatus = useStore((state) => state.refreshAiStatus);

  useEffect(() => {
    void refreshAiStatus();
  }, [refreshAiStatus]);

  // ⌘/Ctrl+, — the platform-standard settings shortcut.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setSettingsOpen]);

  return (
    <>
      {view === "bundle" ? <BundleView /> : <StartScreen />}
      {settingsOpen && (
        <AiSettings
          onClose={() => setSettingsOpen(false)}
          onChanged={() => void refreshAiStatus()}
        />
      )}
    </>
  );
}

export default App;
