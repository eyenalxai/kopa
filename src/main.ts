import { fileURLToPath } from "node:url"

import { Effect, Layer, Schedule, Stream } from "effect"

import { ClipboardService } from "./services/clipboard-service"
import { HistoryService } from "./services/history-service"

const args = new Set(process.argv.slice(2))
const isDaemon = args.has("--daemon")
const isStore = args.has("--store")

const getScriptPath = () => {
  const scriptArg = process.argv[1]
  if (scriptArg !== null && scriptArg !== undefined && scriptArg !== "") {
    return scriptArg
  }
  return fileURLToPath(import.meta.url)
}

const storeProgram = Effect.gen(function* () {
  const history = yield* HistoryService

  const reader = Bun.stdin.stream().getReader()
  const chunks: Uint8Array[] = []

  try {
    while (true) {
      const { done, value } = yield* Effect.promise(async () => reader.read())
      if (done) break
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const content = Buffer.concat(chunks).toString("utf-8")

  if (content.trim()) {
    yield* history.add(content)
  }
})

const daemonProgram = Effect.gen(function* () {
  const clipboard = yield* ClipboardService

  yield* Effect.log("Starting clipboard monitor...")

  const scriptPath = getScriptPath()

  yield* Effect.log("Spawning text watcher...")
  const textProc = Bun.spawn(
    [clipboard.wlPastePath, "--type", "text", "--watch", "bun", "run", scriptPath, "--store"],
    {
      stdout: "ignore",
      stderr: "pipe",
    },
  )

  yield* Effect.log("Spawning image watcher...")
  const imageProc = Bun.spawn(
    [clipboard.wlPastePath, "--type", "image/png", "--watch", "bun", "run", scriptPath, "--store"],
    {
      stdout: "ignore",
      stderr: "pipe",
    },
  )

  const cleanup = Effect.gen(function* () {
    yield* Effect.log("Shutting down clipboard monitor...")
    textProc.kill()
    imageProc.kill()
    yield* Effect.promise(async () => {
      await Promise.allSettled([textProc.exited, imageProc.exited])
    })
  })

  yield* Effect.addFinalizer(() => cleanup)

  const waitForSignal = Effect.async<void>((resume) => {
    const handleSignal = () => resume(Effect.void)
    process.on("SIGINT", handleSignal)
    process.on("SIGTERM", handleSignal)
    return Effect.sync(() => {
      process.off("SIGINT", handleSignal)
      process.off("SIGTERM", handleSignal)
    })
  })

  const textStderrStream = Stream.fromAsyncIterable(textProc.stderr, () => Effect.void).pipe(
    Stream.map((chunk) => new TextDecoder().decode(chunk)),
    Stream.tap((err) => Effect.logError(`text watcher stderr: ${err}`)),
  )

  const imageStderrStream = Stream.fromAsyncIterable(imageProc.stderr, () => Effect.void).pipe(
    Stream.map((chunk) => new TextDecoder().decode(chunk)),
    Stream.tap((err) => Effect.logError(`image watcher stderr: ${err}`)),
  )

  yield* textStderrStream.pipe(Stream.runDrain, Effect.forkDaemon)
  yield* imageStderrStream.pipe(Stream.runDrain, Effect.forkDaemon)

  const watchWatcher = (label: string, proc: Bun.Subprocess) =>
    Effect.promise(async () => proc.exited).pipe(
      Effect.tap((exitCode) =>
        Effect.logError(
          exitCode === 0
            ? `${label} watcher exited unexpectedly`
            : `${label} watcher exited with code ${exitCode}`,
        ),
      ),
      Effect.flatMap(() => Effect.fail(new Error(`${label} watcher exited`))),
    )

  const watcherExit = Effect.raceFirst(
    watchWatcher("text", textProc),
    watchWatcher("image", imageProc),
  )

  yield* Effect.raceFirst(
    waitForSignal,
    Effect.raceFirst(
      watcherExit,
      Effect.repeat(Effect.log("Clipboard monitor running..."), Schedule.fixed("1 minute")),
    ),
  )
})

const AppLive = Layer.mergeAll(HistoryService.Default, ClipboardService.Default)

if (isStore) {
  try {
    await Effect.runPromise(storeProgram.pipe(Effect.provide(AppLive)))
  } catch (error: unknown) {
    console.error("Store error:", error)
    process.exit(1)
  }
} else if (isDaemon) {
  try {
    await Effect.runPromise(daemonProgram.pipe(Effect.provide(AppLive), Effect.scoped))
  } catch (error: unknown) {
    console.error("Daemon error:", error)
    process.exit(1)
  }
} else {
  await import("../tui/index")
}
