import { useRenderer } from "@opentui/react"
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

const ANSI_FALLBACK = [
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

type Theme = {
  primary: string
  secondary: string
  error: string
  warning: string
  success: string
  text: string
  textMuted: string
  background: string
  border: string
  borderSubtle: string
}

type PaletteInput = {
  palette: ReadonlyArray<string | null>
  defaultForeground: string | null
  defaultBackground: string | null
}

const ThemeContext = createContext<Theme | null>(null)

const normalizeHex = (value: string | null | undefined, fallback: string) => {
  if (value && value.startsWith("#")) {
    return value
  }
  return fallback
}

const hexToRgb = (hex: string) => {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex
  if (normalized.length !== 6) return null
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (value: number) => value.toString(16).padStart(2, "0")
  return `#${toHex(Math.max(0, Math.min(255, Math.round(r))))}${toHex(
    Math.max(0, Math.min(255, Math.round(g))),
  )}${toHex(Math.max(0, Math.min(255, Math.round(b))))}`
}

const mix = (hexA: string, hexB: string, t: number) => {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return hexA
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t)
}

const luminance = (hex: string) => {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
}

const buildTheme = (input: PaletteInput): Theme => {
  const fallbackBackground = ANSI_FALLBACK[0] ?? "#000000"
  const fallbackForeground = ANSI_FALLBACK[7] ?? "#ffffff"
  const colorAt = (index: number) =>
    normalizeHex(input.palette[index], ANSI_FALLBACK[index] ?? fallbackForeground)
  const background = normalizeHex(input.defaultBackground, fallbackBackground)
  const text = normalizeHex(input.defaultForeground, fallbackForeground)
  const isDark = luminance(background) < 0.5

  const borderSubtle = mix(background, text, isDark ? 0.2 : 0.18)
  const border = mix(background, text, isDark ? 0.35 : 0.3)
  const textMuted = mix(text, background, isDark ? 0.45 : 0.55)

  return {
    primary: colorAt(6),
    secondary: colorAt(5),
    error: colorAt(1),
    warning: colorAt(3),
    success: colorAt(2),
    text,
    textMuted,
    background,
    border,
    borderSubtle,
  }
}

const fallbackTheme = buildTheme({
  palette: ANSI_FALLBACK,
  defaultForeground: ANSI_FALLBACK[7] ?? "#ffffff",
  defaultBackground: ANSI_FALLBACK[0] ?? "#000000",
})

export const ThemeProvider = ({ children }: { readonly children: ReactNode }) => {
  const renderer = useRenderer()
  const [theme, setTheme] = useState<Theme>(fallbackTheme)

  useEffect(() => {
    let active = true
    renderer
      .getPalette({ size: 16 })
      .then((colors) => {
        if (!active || !colors.palette[0]) return
        setTheme(
          buildTheme({
            palette: colors.palette,
            defaultForeground: colors.defaultForeground,
            defaultBackground: colors.defaultBackground,
          }),
        )
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [renderer])

  const value = useMemo(() => theme, [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const theme = useContext(ThemeContext)
  if (!theme) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return theme
}
