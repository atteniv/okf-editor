import { useEffect } from "react";
import "./App.css";
import { tauriPlatform as platform } from "../platform";
import { SettingsDialog } from "./SettingsDialog";
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

  // Webview anchors can't open tabs: route external links through the OS
  // browser, and stop any other href from navigating the app away
  // (markdown-preview links included).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href") ?? "";
      e.preventDefault();
      if (/^https?:\/\//i.test(href)) {
        void platform.openUrl(href);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      {view === "bundle" ? <BundleView /> : <StartScreen />}
      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onChanged={() => void refreshAiStatus()}
        />
      )}
    </>
  );
}

export default App;
