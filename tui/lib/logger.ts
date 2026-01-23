import { appendFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { Effect, Logger } from "effect"

const logPath = join(homedir(), ".local/share/kopa/kopa.log")

const fileLogger = Logger.make<unknown, void>(({ date, logLevel, message }) => {
  const line = `[${date.toISOString()}] [${logLevel.label}] ${String(message)}\n`
  void appendFile(logPath, line)
})

const fileLoggerLayer = Logger.replace(Logger.defaultLogger, fileLogger)

export const logError = (message: string): void => {
  Effect.runSync(Effect.logError(message).pipe(Effect.provide(fileLoggerLayer)))
}
