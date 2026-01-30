import { Effect, Config } from "effect"

import { ClipboardCopyError } from "../errors"

export class ClipboardService extends Effect.Service<ClipboardService>()("ClipboardService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const wlCopyPath = yield* Config.string("WL_COPY_PATH").pipe(Config.withDefault("wl-copy"))
    const wlPastePath = yield* Config.string("WL_PASTE_PATH").pipe(Config.withDefault("wl-paste"))

    const copy = Effect.fn("ClipboardService.copy")(function* (text: string) {
      const proc = Bun.spawn([wlCopyPath], {
        stdin: "pipe",
        stdout: "ignore",
        stderr: "ignore",
      })

      yield* Effect.promise(async () => {
        await proc.stdin.write(text)
        await proc.stdin.end()
      })

      const exitCode = yield* Effect.promise(async () => proc.exited)

      if (exitCode !== 0) {
        yield* Effect.fail(
          new ClipboardCopyError({
            message: `wl-copy exited with code ${exitCode}`,
          }),
        )
      }
    })

    return { copy, wlCopyPath, wlPastePath }
  }),
}) {}
