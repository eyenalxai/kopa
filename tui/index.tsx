import { BunContext, BunRuntime } from "@effect/platform-bun"
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Effect } from "effect"

import { App } from "./components/app"
import { RootBox } from "./components/root-box"
import { Toast } from "./components/toast-notification"
import { ExitProvider } from "./providers/exit"
import { ThemeProvider } from "./providers/theme"
import { ToastProvider } from "./providers/toast"

const queryClient = new QueryClient()

const run = Effect.tryPromise({
  try: async () =>
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
              <ToastProvider>
                <RootBox>
                  <ThemeProvider>
                    <App />
                    <Toast />
                  </ThemeProvider>
                </RootBox>
              </ToastProvider>
            </ExitProvider>
          </QueryClientProvider>,
        )
      },
      catch: (error) =>
        new Error(typeof error === "string" ? error : "Failed to render TUI application"),
    }),
  ),
  Effect.provide(BunContext.layer),
)

run.pipe(Effect.provide(BunContext.layer), BunRuntime.runMain)
