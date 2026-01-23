import { BunContext, BunRuntime } from "@effect/platform-bun"
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Effect } from "effect"

import { App } from "./components/app"
import { ExitProvider } from "./lib/exit"
import { RootBox } from "./components/root-box"
import { ThemeProvider } from "./lib/theme"

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
              <ThemeProvider>
                <RootBox>
                  <App />
                </RootBox>
              </ThemeProvider>
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
