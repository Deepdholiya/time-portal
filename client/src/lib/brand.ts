/** Paint the portal in the company's colour: sets the CSS variables the theme reads for --brand. */
export function applyBrand(color: string | null | undefined) {
  const root = document.documentElement;
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) {
    root.style.removeProperty("--company-brand");
    root.style.removeProperty("--company-brand-fg");
    return;
  }
  root.style.setProperty("--company-brand", color);
  root.style.setProperty("--company-brand-fg", readableOn(color));
}

/** White text unless the colour is too light for it (yellows, pastels); then near-black. Uses WCAG relative luminance. */
export function readableOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05) >= 2.5 ? "#ffffff" : "#111111";
}
