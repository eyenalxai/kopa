export const ANSI_FALLBACK = [
  "#000000",
  "#800000",
  "#008000",
  "#808000",
  "#000080",
  "#800080",
  "#008080",
  "#c0c0c0",
  "#808080",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#0000ff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
]

export const normalizeHex = (value: string | null | undefined, fallback: string) => {
  if (value !== null && value !== undefined && value !== "" && value.startsWith("#")) {
    return value
  }
  return fallback
}

export const hexToRgb = (hex: string) => {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex
  if (normalized.length !== 6) return null
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}

const toHex = (value: number) => value.toString(16).padStart(2, "0")

export const rgbToHex = (r: number, g: number, b: number) => {
  return `#${toHex(Math.max(0, Math.min(255, Math.round(r))))}${toHex(
    Math.max(0, Math.min(255, Math.round(g))),
  )}${toHex(Math.max(0, Math.min(255, Math.round(b))))}`
}

export const mix = (hexA: string, hexB: string, t: number) => {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return hexA
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t)
}

export const luminance = (hex: string) => {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
}
