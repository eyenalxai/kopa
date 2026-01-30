import { appendFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join, dirname } from "node:path"

import { Effect, Logger } from "effect"

const logPath = join(homedir(), ".local/share/kopa/kopa.log")

// Ensure log directory exists synchronously
try {
  mkdirSync(dirname(logPath), { recursive: true })
} catch (error) {
  console.error("Failed to create log directory:", error)
}

const fileLogger = Logger.make<unknown, void>(({ date, logLevel, message }) => {
  const line = `[${date.toISOString()}] [${logLevel.label}] ${String(message)}\n`
  try {
    appendFileSync(logPath, line)
  } catch (error) {
    console.error("Failed to write to log file:", error)
  }
})

const fileLoggerLayer = Logger.replace(Logger.defaultLogger, fileLogger)

export const logError = (message: string): void => {
  Effect.runSync(Effect.logError(message).pipe(Effect.provide(fileLoggerLayer)))
}
