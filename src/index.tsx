import { Command, Options } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { Effect } from "effect"

import packageJson from "../package.json"
import { App } from "./tui/app"

const daemon = Options.boolean("daemon").pipe(
  Options.withDescription("run a long-lived background task"),
  Options.withDefault(false)
)

const command = Command.make("kopa", { daemon }, ({ daemon }) =>
  daemon
    ? Effect.async<never, never, never>(() => {
        let counter = 0
        const intervalId = setInterval(() => {
          counter += 1
          console.log(`daemon tick ${counter}`)
        }, 1000)
        return Effect.sync(() => {
          clearInterval(intervalId)
        })
      })
    : Effect.tryPromise({
        try: () => createCliRenderer(),
        catch: (error) =>
          new Error(
            typeof error === "string"
              ? error
              : "Failed to create CLI renderer"
          ),
      }).pipe(
        Effect.andThen((renderer) =>
          Effect.try({
            try: () => {
              createRoot(renderer).render(<App />)
            },
            catch: (error) =>
              new Error(
                typeof error === "string"
                  ? error
                  : "Failed to render TUI application"
              ),
          })
        )
      )
)

const cli = Command.run(command, {
  name: "kopa",
  version: packageJson.version,
})

const run = Effect.try({
  try: () => Bun.argv,
  catch: (error) =>
    new Error(
      typeof error === "string" ? error : "Failed to read CLI arguments"
    ),
}).pipe(Effect.flatMap((args) => cli(args)))

run.pipe(Effect.provide(BunContext.layer), BunRuntime.runMain)
