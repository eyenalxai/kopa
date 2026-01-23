import { BunContext, BunRuntime } from "@effect/platform-bun"
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { Effect } from "effect"

import { App } from "./app"

const run = Effect.tryPromise({
  try: () => createCliRenderer(),
  catch: (error) => new Error(typeof error === "string" ? error : "Failed to create CLI renderer"),
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
)

run.pipe(Effect.provide(BunContext.layer), BunRuntime.runMain)
