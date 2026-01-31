import { appendFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join, dirname } from "node:path"

import { Effect, Logger, Schema } from "effect"

export class LoggerSetupError extends Schema.TaggedError<LoggerSetupError>()("LoggerSetupError", {
  message: Schema.String,
}) {}

const logPath = join(homedir(), ".local/share/kopa/kopa.log")

// Synchronous setup for immediate logging (used by React components)
const setupLogDirectory = () => {
  try {
    mkdirSync(dirname(logPath), { recursive: true })
  } catch {
    // Directory might already exist, that's fine
  }
}

setupLogDirectory()

const fileLogger = Logger.make<unknown, void>(({ date, logLevel, message }) => {
  const line = `[${date.toISOString()}] [${logLevel.label}] ${String(message)}\n`
  try {
    appendFileSync(logPath, line)
  } catch {
    // Fail silently - if we can't write to log file, there's nothing we can do
  }
})

// Effectful setup for main TUI runtime (creates directory asynchronously)
export const makeTuiLoggerLayer = Effect.gen(function* () {
  yield* Effect.tryPromise({
    try: async () => {
      const { mkdir } = await import("node:fs/promises")
      await mkdir(dirname(logPath), { recursive: true })
    },
    catch: (error) =>
      new LoggerSetupError({ message: `Failed to create log directory: ${String(error)}` }),
  })

  return Logger.replace(Logger.defaultLogger, fileLogger)
})

// Synchronous log function for React components
export const logError = (message: string): void => {
  Effect.runSync(
    Effect.logError(message).pipe(Effect.provide(Logger.replace(Logger.defaultLogger, fileLogger))),
  )
}
