export type Theme = "light" | "dark" | "system";
export function getTheme(): Theme {
  try { return (localStorage.getItem("tp-theme") as Theme) || "system"; } catch { return "system"; }
}
export function applyTheme(t: Theme) {
  try { localStorage.setItem("tp-theme", t); } catch { /* ignore */ }
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}
export function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}
