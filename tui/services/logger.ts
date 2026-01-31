import { appendFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join, dirname } from "node:path"

import { Effect, Logger } from "effect"

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

export const fileLogger = Logger.make<unknown, void>(({ date, logLevel, message }) => {
  const line = `[${date.toISOString()}] [${logLevel.label}] ${JSON.stringify(message)}\n`
  try {
    appendFileSync(logPath, line)
  } catch {
    // Fail silently - if we can't write to log file, there's nothing we can do
  }
})

// Synchronous log function for React components
export const logError = (message: string): void => {
  Effect.runSync(
    Effect.logError(message).pipe(Effect.provide(Logger.replace(Logger.defaultLogger, fileLogger))),
  )
}
