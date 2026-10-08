type CardTone = "surface" | "canvas";

const TONES: Record<CardTone, string> = {
  surface: "bg-surface",
  canvas: "bg-canvas",
};

/** Frame shared by every card: radius, hairline border and background. Padding and layout come from `className`. */
export function cardClass(tone: CardTone, className?: string) {
  return ["rounded-2xl border border-ink-200", TONES[tone], className].filter(Boolean).join(" ");
}
