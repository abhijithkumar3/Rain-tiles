export type Theme = {
  id: string;
  name: string;
  /** swatch shown in the switcher */
  swatch: string;
  bgTop: string;
  bgBottom: string;
  rain: string[];
  glass: string[];
  spark: string;
  ripple: string;
};

// Canvas colors live here (not CSS) because they are painted per-frame on the canvas.
export const THEMES: Theme[] = [
  {
    id: "neon-pink",
    name: "Neon Pink",
    swatch: "#FF2E8B",
    bgTop: "#050510",
    bgBottom: "#0F1426",
    rain: ["#FF4D9E", "#FF7AB8", "#FF2E8B", "#FFB3D6"],
    glass: ["#FF2E8B", "#C24CFF", "#5C7BFF", "#FF5FB0"],
    spark: "#FFD1E8",
    ripple: "#B9C2FF",
  },
  {
    id: "cyber-blue",
    name: "Cyber Blue",
    swatch: "#2FA8FF",
    bgTop: "#02060F",
    bgBottom: "#071A2E",
    rain: ["#CFE9FF", "#5CC8FF", "#2FA8FF", "#FFFFFF"],
    glass: ["#2FA8FF", "#00E5FF", "#4C6BFF", "#7FD8FF"],
    spark: "#D6F4FF",
    ripple: "#7FD8FF",
  },
];
