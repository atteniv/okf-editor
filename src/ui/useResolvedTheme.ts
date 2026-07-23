import { useEffect, useState } from "react";
import {
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "../core/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function useResolvedTheme(
  preference: ThemePreference,
): ResolvedTheme {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia(DARK_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return resolveTheme(preference, systemDark);
}
