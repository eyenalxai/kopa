import { Effect, Config } from "effect"

import { ClipboardCopyError } from "../errors"

export class ClipboardService extends Effect.Service<ClipboardService>()("ClipboardService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const wlCopyPath = yield* Config.string("WL_COPY_PATH").pipe(Config.withDefault("wl-copy"))
    const wlPastePath = yield* Config.string("WL_PASTE_PATH").pipe(Config.withDefault("wl-paste"))

    const copyText = Effect.fn("ClipboardService.copyText")(function* (text: string) {
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
        return yield* new ClipboardCopyError({
          message: `wl-copy exited with code ${exitCode}`,
        })
      }
    })

    const copyImage = Effect.fn("ClipboardService.copyImage")(function* (filePath: string) {
      const proc = Bun.spawn([wlCopyPath, "-t", "image/png"], {
        stdin: Bun.file(filePath),
        stdout: "ignore",
        stderr: "ignore",
      })

      const exitCode = yield* Effect.promise(async () => proc.exited)

      if (exitCode !== 0) {
        return yield* new ClipboardCopyError({
          message: `wl-copy exited with code ${exitCode} when copying image`,
        })
      }
    })

    return { copyText, copyImage, wlCopyPath, wlPastePath }
  }),
}) {}
