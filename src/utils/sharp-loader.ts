import { Effect, Config } from "effect"
import type sharp from "sharp"

import { SharpLoadError } from "../errors"

type SharpModule = { default?: typeof sharp } & typeof sharp

const isSharpModule = (mod: unknown): mod is SharpModule => {
  if (typeof mod !== "object" || mod === null) return false
  const hasDefault =
    "default" in mod && typeof (mod as { default?: unknown }).default === "function"
  const isCallable = typeof mod === "function"
  return hasDefault || isCallable
}

export const loadSharp = Effect.fn("HistoryService.loadSharp")(function* () {
  const sharpPath = yield* Config.string("SHARP_PATH").pipe(Config.withDefault(""))
  const load = async (path: string) => {
    const mod: unknown = await import(path)
    if (!isSharpModule(mod)) throw new Error(`Invalid sharp module at ${path}`)
    return mod.default ?? mod
  }
  if (sharpPath !== "") {
    return yield* Effect.tryPromise({
      try: () => load(sharpPath),
      catch: (error) =>
        new SharpLoadError({
          message: `Failed to load sharp: ${String(error)}`,
          path: sharpPath,
        }),
    })
  }
  return yield* Effect.tryPromise({
    try: () => load("sharp"),
    catch: (error) => new SharpLoadError({ message: `Failed to load sharp: ${String(error)}` }),
  })
})
