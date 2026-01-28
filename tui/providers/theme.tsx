import { useRenderer } from "@opentui/react"
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { logError } from "../services/logger"
import { ANSI_FALLBACK, luminance, mix, normalizeHex } from "../utils/colors"

export type Theme = {
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
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    renderer
      .getPalette({ size: 16 })
      .then((colors) => {
        if (!active) return
        if (!colors.palette[0]) return
        setTheme(
          buildTheme({
            palette: colors.palette,
            defaultForeground: colors.defaultForeground,
            defaultBackground: colors.defaultBackground,
          }),
        )
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Failed to load theme palette"
        logError(message)
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [renderer])

  const value = useMemo(() => theme, [theme])

  if (isLoading) {
    return null
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const theme = useContext(ThemeContext)
  if (!theme) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return theme
}
