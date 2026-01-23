import { BunContext, BunRuntime } from "@effect/platform-bun"
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Effect } from "effect"

import { App } from "./app"
import { ExitProvider } from "./exit"
import { RootBox } from "./root-box"

const queryClient = new QueryClient()

const run = Effect.tryPromise({
  try: () =>
    createCliRenderer({
      exitOnCtrlC: false,
      useKittyKeyboard: {},
    }),
  catch: (error) => new Error(typeof error === "string" ? error : "Failed to create CLI renderer"),
}).pipe(
  Effect.andThen((renderer) =>
    Effect.try({
      try: () => {
        createRoot(renderer).render(
          <QueryClientProvider client={queryClient}>
            <ExitProvider>
              <RootBox>
                <App />
              </RootBox>
            </ExitProvider>
          </QueryClientProvider>,
        )
      },
      catch: (error) =>
        new Error(typeof error === "string" ? error : "Failed to render TUI application"),
    }),
  ),
)

run.pipe(Effect.provide(BunContext.layer), BunRuntime.runMain)
