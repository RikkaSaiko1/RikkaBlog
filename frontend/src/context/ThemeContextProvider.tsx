import { createContext, useState, useMemo, useContext, ReactNode, useEffect } from "react";
import { ThemeProvider as MuiThemeProvider, createTheme, type PaletteMode } from "@mui/material";
import { lightTheme, darkTheme } from "../theme";
import { useCallback } from "react";

type AppThemeContextType = {
  themeMode: PaletteMode;
  toggleTheme: () => void;
};

const AppThemeContext = createContext<AppThemeContextType>({
  themeMode: "dark",
  toggleTheme: () => {},
});

export const useAppTheme = () => useContext(AppThemeContext);

const isBrowser = typeof window !== "undefined";

// 读取用户显式选择过的主题；没选过返回 null（此时跟随系统）
const readStoredMode = (): PaletteMode | null => {
  if (!isBrowser) return null;
  try {
    const stored = localStorage.getItem("themeMode");
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
};

// 系统当前偏好的配色（无显式选择时使用，默认暗色）
const systemMode = (): PaletteMode =>
  isBrowser && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";

export const AppThemeProvider = ({ children }: { children: ReactNode }) => {
  const [themeMode, setThemeMode] = useState<PaletteMode>(() => readStoredMode() ?? systemMode());
  // 用户是否手动切换过；未切换过则持续跟随系统日/夜模式变化
  const [explicit, setExplicit] = useState(() => readStoredMode() !== null);

  const toggleTheme = useCallback(() => {
    setExplicit(true);
    setThemeMode((prevMode: PaletteMode) => {
      const newMode = prevMode === "light" ? "dark" : "light";
      if (isBrowser) {
        try {
          localStorage.setItem("themeMode", newMode);
        } catch (error) {
          // Handle potential errors if localStorage is not available
          console.error("Failed to save theme mode to localStorage", error);
        }
      }
      return newMode;
    });
  }, []);

  const theme = useMemo(() => (themeMode === "light" ? lightTheme : darkTheme), [themeMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  // 跟随其他标签页的主题切换（如前台切了日间，后台标签页同步生效）
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "themeMode") return;
      const mode = readStoredMode();
      if (mode) {
        setExplicit(true);
        setThemeMode(mode);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 用户未手动选择时，跟随系统日/夜模式实时切换
  useEffect(() => {
    if (explicit || !isBrowser || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setThemeMode(media.matches ? "light" : "dark");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [explicit]);

  return (
    <AppThemeContext.Provider value={{ themeMode, toggleTheme }}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </AppThemeContext.Provider>
  );
};
