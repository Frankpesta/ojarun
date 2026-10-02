import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useColorScheme as useSystemScheme, View } from "react-native";
import { colorScheme as nwColorScheme, vars } from "nativewind";
import * as SystemUI from "expo-system-ui";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { scrimOpacity, themes, themeVars, type Theme, type ThemeName } from "@ojarun/ui";
import { zustandStorage } from "@/lib/storage";

export type ThemePreference = "system" | "light" | "dark";

type ThemePrefState = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
};

/** Persisted in MMKV, read synchronously, so the right theme paints first time (05 §7.3). */
export const useThemePreference = create<ThemePrefState>()(
  persist(
    (set) => ({
      preference: "system",
      setPreference: (preference) => set({ preference }),
    }),
    { name: "theme-preference", storage: createJSONStorage(() => zustandStorage) },
  ),
);

type ThemeContextValue = {
  name: ThemeName;
  colors: Theme;
  scrimOpacity: number;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const cssVars = {
  light: vars(themeVars(themes.light)),
  dark: vars(themeVars(themes.dark)),
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemScheme();
  const preference = useThemePreference((s) => s.preference);
  const name: ThemeName = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;

  useEffect(() => {
    nwColorScheme.set(name);
    void SystemUI.setBackgroundColorAsync(themes[name].bg);
  }, [name]);

  const value = useMemo<ThemeContextValue>(
    () => ({ name, colors: themes[name], scrimOpacity: scrimOpacity[name] }),
    [name],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1, backgroundColor: themes[name].bg }, cssVars[name]]}>{children}</View>
    </ThemeContext.Provider>
  );
}

/** Raw token values for places classNames can't reach (icons, native props, Reanimated). */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
