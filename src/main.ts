import { createHash } from "node:crypto"

import { Effect, Layer, Schedule, Schema } from "effect"

import { ClipboardService } from "./services/clipboard-service"
import { HistoryService } from "./services/history-service"

const args = new Set(process.argv.slice(2))
const isDaemon = args.has("--daemon")
const isStore = args.has("--store")

export class ScriptPathError extends Schema.TaggedError<ScriptPathError>()("ScriptPathError", {
  message: Schema.String,
  argv0: Schema.optional(Schema.String),
  argv1: Schema.optional(Schema.String),
}) {}

const isCompiledBinary = () => {
  // Production mode: KOPA_BINARY_PATH env var is set
  if (process.env.KOPA_BINARY_PATH !== undefined && process.env.KOPA_BINARY_PATH !== "") {
    return true
  }

  // Dev mode: check if not running via bun CLI
  const argv0 = process.argv[0]
  if (argv0 === undefined) return false
  return argv0 !== "bun" && !argv0.endsWith("/bun")
}

const getScriptPath = Effect.fn("ScriptPath.getScriptPath")(function* () {
  // Check for production path via environment variable (avoids hardcoded paths)
  const binaryPath = process.env.KOPA_BINARY_PATH
  if (binaryPath !== undefined && binaryPath !== "") {
    return binaryPath
  }

  if (isCompiledBinary()) {
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

const detectImageFormat = (buffer: Buffer): "png" | "jpeg" | null => {
  if (buffer.length < 4) return null

  // PNG magic bytes: 0x89 0x50 0x4E 0x47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "png"
  }

  // JPEG magic bytes: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg"
  }

  return null
}

const computeHash = (data: Uint8Array): string => {
  return createHash("sha256").update(data).digest("hex")
}

const storeProgram = Effect.gen(function* () {
  const history = yield* HistoryService

  const buffer = yield* Effect.tryPromise({
    try: async () => Bun.readableStreamToArrayBuffer(Bun.stdin.stream()),
    catch: (error) => new Error(`Failed to read stdin: ${String(error)}`),
  }).pipe(Effect.map((ab) => Buffer.from(ab)))

  if (buffer.length === 0) {
    return
  }

  const imageFormat = detectImageFormat(buffer)

  if (imageFormat) {
    const hash = computeHash(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength))
    const timestamp = new Date().toISOString()
    const displayValue = `📷 ${timestamp}`

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
  const compiled = isCompiledBinary()

  // Build spawn args: compiled binary runs directly, dev mode uses "bun run"
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

  // Log stderr from watcher processes
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
