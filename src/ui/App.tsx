import { useEffect } from "react";
import "./App.css";
import { tauriPlatform as platform } from "../platform";
import { SettingsDialog } from "./SettingsDialog";
import { BundleView } from "./BundleView";
import { StartScreen } from "./StartScreen";
import { useStore } from "./store";
import { useResolvedTheme } from "./useResolvedTheme";

function App() {
  const view = useStore((state) => state.view);
  const settingsOpen = useStore((state) => state.settingsOpen);
  const themePreference = useStore((state) => state.themePreference);
  const resolvedTheme = useResolvedTheme(themePreference);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const refreshAiStatus = useStore((state) => state.refreshAiStatus);
  const refreshPerplexityStatus = useStore(
    (state) => state.refreshPerplexityStatus,
  );

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    void refreshAiStatus();
    void refreshPerplexityStatus();
  }, [refreshAiStatus, refreshPerplexityStatus]);

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
        platform.openUrl(href).catch((err: unknown) => {
          console.error("openUrl failed", href, err);
        });
      }
    };
    // Capture phase: dialogs stopPropagation() on bubble to avoid
    // closing themselves, which would otherwise eat link clicks.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <>
      {view === "bundle" ? <BundleView /> : <StartScreen />}
      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onChanged={() => {
            void refreshAiStatus();
            void refreshPerplexityStatus();
          }}
        />
      )}
    </>
  );
}

export default App;
