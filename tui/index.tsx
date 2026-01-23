import { access } from "node:fs/promises"

import { BunContext, BunRuntime } from "@effect/platform-bun"
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { Effect } from "effect"

import { App } from "./app"
import { dbPath } from "./db"

const ensureDb = Effect.tryPromise({
  try: () => access(dbPath),
  catch: (error) =>
    new Error(
      `Unable to open kopa database at ${dbPath}\n\n${typeof error === "string" ? error : ""}`.trim(),
    ),
})

const run = Effect.matchEffect(ensureDb, {
  onFailure: (error) => Effect.logError(error.message),
  onSuccess: () =>
    Effect.tryPromise({
      try: () => createCliRenderer(),
      catch: (error) =>
        new Error(typeof error === "string" ? error : "Failed to create CLI renderer"),
    }).pipe(
      Effect.andThen((renderer) =>
        Effect.try({
          try: () => {
            createRoot(renderer).render(<App />)
          },
          catch: (error) =>
            new Error(typeof error === "string" ? error : "Failed to render TUI application"),
        }),
      ),
    ),
})

run.pipe(Effect.provide(BunContext.layer), BunRuntime.runMain)
