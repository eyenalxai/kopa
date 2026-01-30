import { homedir } from "node:os"
import { join } from "node:path"

import { FileSystem } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
import { useRenderer } from "@opentui/react"
import { Effect, Option, Schema } from "effect"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

import { logError } from "../services/logger"
import { ANSI_FALLBACK, luminance, mix, normalizeHex } from "../utils/colors"

const cachePath = join(homedir(), ".local/share/kopa/theme-cache.json")
const cacheDir = join(homedir(), ".local/share/kopa")

const PaletteInputSchema = Schema.Struct({
  palette: Schema.Array(Schema.NullOr(Schema.String)),
  defaultForeground: Schema.NullOr(Schema.String),
  defaultBackground: Schema.NullOr(Schema.String),
})

const readCache = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const content = yield* fs.readFileString(cachePath)
  const parsed = yield* Effect.try(() => JSON.parse(content))
  return yield* Schema.decodeUnknown(PaletteInputSchema)(parsed)
}).pipe(Effect.provide(BunContext.layer), Effect.option)

const writeCache = (input: PaletteInput) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(cacheDir, { recursive: true })
    yield* fs.writeFileString(cachePath, JSON.stringify(input))
  }).pipe(
    Effect.provide(BunContext.layer),
    Effect.catchAll(() => Effect.void),
  )

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

export const ThemeProvider = async ({ children }: { readonly children: ReactNode }) => {
  const renderer = useRenderer()
  const [theme, setTheme] = useState<Theme | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    const program = Effect.gen(function* () {
      const cached = yield* readCache
      if (Option.isSome(cached) && cached.value.palette[0] && active) {
        setTheme(buildTheme(cached.value))
        setIsLoading(false)
      }

      const fresh = yield* Effect.tryPromise(async () => renderer.getPalette({ size: 16 }))
      if (!active || !fresh.palette[0]) return

      const freshInput: PaletteInput = {
        palette: fresh.palette,
        defaultForeground: fresh.defaultForeground,
        defaultBackground: fresh.defaultBackground,
      }

      const cachedValue = Option.isSome(cached) ? cached.value : null
      const hasChanged = JSON.stringify(cachedValue) !== JSON.stringify(freshInput)
      if (hasChanged) {
        setTheme(buildTheme(freshInput))
        yield* writeCache(freshInput)
      }
    }).pipe(
      Effect.catchAll((error) => {
        logError(error instanceof Error ? error.message : "Failed to load palette")
        return Effect.void
      }),
      Effect.ensuring(
        Effect.sync(() => {
          if (active) setIsLoading(false)
        }),
      ),
    )

    void Effect.runPromise(program)
    return () => {
      active = false
    }
  }, [renderer])

  if (isLoading && !theme) {
    return null
  }

  return <ThemeContext.Provider value={theme ?? fallbackTheme}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const theme = useContext(ThemeContext)
  if (!theme) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return theme
}
