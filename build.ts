import { BunRuntime } from "@effect/platform-bun"
import { Effect } from "effect"

const build = Effect.tryPromise({
  try: async () => {
    await Bun.$`bun build --compile --target=bun-linux-x64-modern ./tui/index.tsx --outfile ./dist/kopa`
  },
  catch: (error) => (error instanceof Error ? error : new Error("Build failed")),
})

const program = build.pipe(
  Effect.tap(() => Effect.log("Built executable at ./dist/kopa")),
  Effect.tapErrorCause((cause) => Effect.logError(cause)),
)

BunRuntime.runMain(program)
