import { BunRuntime } from "@effect/platform-bun"
import { Effect, Schedule, Layer, Config, Schema } from "effect"

import { makeTuiLoggerLayer } from "../tui/services/logger"

import { ClipboardService } from "./services/clipboard-service"
import { ConfigService } from "./services/config-service"
import { HistoryService } from "./services/history-service"
import { computeHash } from "./utils/hash"
import { detectImageFormat } from "./utils/image"

const args = new Set(process.argv.slice(2))
const isDaemon = args.has("--daemon")
const isStore = args.has("--store")
const isTui = !isDaemon && !isStore

export class ScriptPathError extends Schema.TaggedError<ScriptPathError>()("ScriptPathError", {
  message: Schema.String,
  argv0: Schema.optional(Schema.String),
  argv1: Schema.optional(Schema.String),
}) {}

export class StoreError extends Schema.TaggedError<StoreError>()("StoreError", {
  message: Schema.String,
}) {}

export class DaemonError extends Schema.TaggedError<DaemonError>()("DaemonError", {
  message: Schema.String,
}) {}

const isCompiledBinary = Effect.fn("BinaryMode.isCompiledBinary")(function* () {
  const binaryPath = yield* Config.string("KOPA_BINARY_PATH").pipe(Config.withDefault(""))
  if (binaryPath !== "") {
    return true
  }

  const argv0 = process.argv[0]
  if (argv0 === undefined) return false
  return argv0 !== "bun" && !argv0.endsWith("/bun")
})

const getScriptPath = Effect.fn("ScriptPath.getScriptPath")(function* () {
  const binaryPath = yield* Config.string("KOPA_BINARY_PATH").pipe(Config.withDefault(""))
  if (binaryPath !== "") {
    return binaryPath
  }

  const compiled = yield* isCompiledBinary()
  if (compiled) {
    const argv0 = process.argv[0]
    if (argv0 !== undefined && argv0 !== "") {
      return argv0
    }
    return yield* Effect.fail(
      new ScriptPathError({
        message: "process.argv[0] is empty in compiled binary mode",
        argv0: process.argv[0],
        argv1: process.argv[1],
      }),
    )
  }

  const argv1 = process.argv[1]
  if (argv1 !== undefined && argv1 !== "") {
    return argv1
  }
  return yield* Effect.fail(
    new ScriptPathError({
      message: "process.argv[1] is empty in dev mode",
      argv0: process.argv[0],
      argv1: process.argv[1],
    }),
  )
})

const storeProgram = Effect.gen(function* () {
  const history = yield* HistoryService
  const config = yield* ConfigService

  const buffer = yield* Effect.tryPromise({
    try: async () => Bun.readableStreamToArrayBuffer(Bun.stdin.stream()),
    catch: (error) =>
      new StoreError({
        message: `Failed to read stdin: ${String(error)}`,
      }),
  }).pipe(Effect.map((ab) => Buffer.from(ab)))

  if (buffer.length === 0) {
    return
  }

  const maxSizeMb = config.maxFileSizeMb
  const maxSizeBytes = maxSizeMb * 1024 * 1024
  if (buffer.length > maxSizeBytes) {
    yield* Effect.log(
      `Skipped storing clipboard content: ${(buffer.length / 1024 / 1024).toFixed(2)}MB exceeds ${maxSizeMb}MB limit`,
    )
    return
  }

  const imageFormat = detectImageFormat(buffer)

  if (imageFormat) {
    const hash = computeHash(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength))
    const timestamp = new Date().toISOString()
    const displayValue = `📷 image ${timestamp}`

    yield* history.addImage(hash, buffer, displayValue)
  } else {
    const content = buffer.toString("utf-8")
    if (content.trim()) {
      yield* history.addText(content)
    }
  }
})

const daemonProgram = Effect.gen(function* () {
  const clipboard = yield* ClipboardService

  yield* Effect.log("Starting clipboard monitor...")

  const scriptPath = yield* getScriptPath()
  const compiled = yield* isCompiledBinary()

  const textSpawnArgs = compiled
    ? [clipboard.wlPastePath, "--type", "text", "--watch", scriptPath, "--store"]
    : [clipboard.wlPastePath, "--type", "text", "--watch", "bun", "run", scriptPath, "--store"]

  const imageSpawnArgs = compiled
    ? [clipboard.wlPastePath, "--type", "image/png", "--watch", scriptPath, "--store"]
    : [clipboard.wlPastePath, "--type", "image/png", "--watch", "bun", "run", scriptPath, "--store"]

  yield* Effect.log("Spawning text watcher...")
  const textProc = Bun.spawn(textSpawnArgs, {
    stdout: "ignore",
    stderr: "pipe",
  })

  yield* Effect.log("Spawning image watcher...")
  const imageProc = Bun.spawn(imageSpawnArgs, {
    stdout: "ignore",
    stderr: "pipe",
  })

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

  const logStderr = Effect.fn("daemon.logStderr")(
    (label: string, stream: ReadableStream<Uint8Array>) =>
      Effect.tryPromise({
        try: async () => {
          const chunks = await Bun.readableStreamToArray(stream)
          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
          const combined = new Uint8Array(totalLength)
          let offset = 0
          for (const chunk of chunks) {
            combined.set(chunk, offset)
            offset += chunk.length
          }
          return new TextDecoder().decode(combined)
        },
        catch: () => Effect.void,
      }).pipe(
        Effect.flatMap((text) =>
          text.trim() ? Effect.logError(`${label} watcher stderr: ${text}`) : Effect.void,
        ),
        Effect.catchAll(() => Effect.void),
      ),
  )

  yield* logStderr("text", textProc.stderr).pipe(Effect.forkDaemon)
  yield* logStderr("image", imageProc.stderr).pipe(Effect.forkDaemon)

  const watchWatcher = (label: string, proc: Bun.Subprocess) =>
    Effect.promise(async () => proc.exited).pipe(
      Effect.tap((exitCode) =>
        Effect.logError(
          exitCode === 0
            ? `${label} watcher exited unexpectedly`
            : `${label} watcher exited with code ${exitCode}`,
        ),
      ),
      Effect.flatMap(() => Effect.fail(new DaemonError({ message: `${label} watcher exited` }))),
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

const tuiProgram = Effect.tryPromise({
  try: async () => {
    await import("../tui/index")
  },
  catch: (error) => new Error(`Failed to start TUI: ${String(error)}`),
})

const mainProgram = Effect.gen(function* () {
  if (isStore) {
    yield* storeProgram
  } else if (isDaemon) {
    yield* daemonProgram
  } else {
    yield* tuiProgram
  }
})

const AppLive = Layer.mergeAll(
  ConfigService.Default,
  HistoryService.Default,
  ClipboardService.Default,
)

const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  if (error === null || error === undefined) {
    return "Unknown error"
  }
  try {
    return JSON.stringify(error)
  } catch {
    return "Unknown error"
  }
}

const program = Effect.gen(function* () {
  if (isTui) {
    const loggerLayer = yield* makeTuiLoggerLayer
    const TuiLive = Layer.merge(AppLive, loggerLayer)
    return yield* mainProgram.pipe(Effect.provide(TuiLive), Effect.scoped)
  }
  return yield* mainProgram.pipe(Effect.provide(AppLive), Effect.scoped)
})

program.pipe(
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      yield* Effect.logError("Fatal error:", { error: describeError(error) })
      return yield* Effect.fail(error)
    }),
  ),
  BunRuntime.runMain,
)
