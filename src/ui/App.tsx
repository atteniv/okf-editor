import { useEffect } from "react";
import "./App.css";
import { tauriPlatform as platform } from "../platform";
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

  // Native app menu: Settings… (Cmd+,).
  useEffect(() => {
    const subscription = platform.onOpenSettings(() => setSettingsOpen(true));
    return () => {
      void subscription.then((unlisten) => unlisten());
    };
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
