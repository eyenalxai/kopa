import { mkdir, open, unlink } from "node:fs/promises"
import { homedir } from "node:os"

import { Effect, Config, Schema } from "effect"

import { HistoryReadError, HistoryWriteError } from "../errors"
import { ClipboardHistory, type ClipboardEntry } from "../types"

const hasErrorCode = (value: unknown): value is { code?: unknown } =>
  typeof value === "object" && value !== null && "code" in value

const getErrorCode = (error: unknown): string | null => {
  if (hasErrorCode(error)) {
    return typeof error.code === "string" ? error.code : null
  }
  return null
}

export class HistoryService extends Effect.Service<HistoryService>()("HistoryService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const dataDir = yield* Config.string("KOPA_DATA_DIR").pipe(
      Config.withDefault(`${homedir()}/.config/kopa`),
    )

    const historyFilePath = `${dataDir}/history.json`
    const lockFilePath = `${dataDir}/history.lock`
    const lockTimeoutMs = 5_000

    const ensureDir = Effect.fn("HistoryService.ensureDir")(function* () {
      yield* Effect.promise(async () => mkdir(dataDir, { recursive: true }))
    })

    const acquireLock = Effect.fn("HistoryService.acquireLock")(function* () {
      const startedAt = Date.now()
      while (true) {
        const acquired = yield* Effect.tryPromise({
          try: async () => {
            try {
              const handle = await open(lockFilePath, "wx")
              await handle.close()
              return true
            } catch (error) {
              if (getErrorCode(error) === "EEXIST") {
                return false
              }
              throw error
            }
          },
          catch: (error) =>
            new HistoryWriteError({
              message: `Failed to acquire history lock: ${String(error)}`,
            }),
        })

        if (acquired) {
          return
        }

        if (Date.now() - startedAt >= lockTimeoutMs) {
          return yield* Effect.fail(
            new HistoryWriteError({
              message: `Timed out waiting for history lock after ${lockTimeoutMs}ms`,
            }),
          )
        }

        yield* Effect.sleep("50 millis")
      }
    })

    const releaseLock = Effect.fn("HistoryService.releaseLock")(function* () {
      yield* Effect.tryPromise({
        try: async () => {
          try {
            await unlink(lockFilePath)
          } catch (error) {
            if (getErrorCode(error) !== "ENOENT") {
              throw error
            }
          }
        },
        catch: (error) =>
          new HistoryWriteError({
            message: `Failed to release history lock: ${String(error)}`,
          }),
      })
    })
    const releaseLockSafe = releaseLock().pipe(Effect.catchAll(() => Effect.void))

    const read = Effect.fn("HistoryService.read")(function* () {
      yield* ensureDir()
      const file = Bun.file(historyFilePath)
      const exists = yield* Effect.promise(async () => file.exists())

      if (!exists) {
        return { clipboardHistory: [] }
      }

      const rawHistory = yield* Effect.tryPromise({
        try: async () => (await file.json()) as unknown,
        catch: (error) =>
          new HistoryReadError({
            message: `Failed to read history: ${String(error)}`,
          }),
      })

      return yield* Schema.decodeUnknown(ClipboardHistory)(rawHistory).pipe(
        Effect.mapError(
          (error) =>
            new HistoryReadError({
              message: `Failed to decode history: ${String(error)}`,
            }),
        ),
      )
    })

    const write = Effect.fn("HistoryService.write")(function* (history: ClipboardHistory) {
      yield* ensureDir()
      return yield* Effect.tryPromise({
        try: async () => Bun.write(historyFilePath, JSON.stringify(history, null, 2)),
        catch: (error) =>
          new HistoryWriteError({
            message: `Failed to write history: ${String(error)}`,
          }),
      })
    })

    const writeLocked = Effect.fn("HistoryService.writeLocked")(function* (
      history: ClipboardHistory,
    ) {
      yield* acquireLock()
      return yield* write(history).pipe(Effect.ensuring(releaseLockSafe))
    })

    const add = Effect.fn("HistoryService.add")(function* (value: string) {
      const trimmedValue = value.trim()
      if (!trimmedValue) {
        return
      }

      yield* acquireLock()
      return yield* Effect.gen(function* () {
        const history = yield* read()

        if (history.clipboardHistory[0]?.value === trimmedValue) {
          return
        }

        const newEntry: ClipboardEntry = {
          value: trimmedValue,
          recorded: new Date().toISOString(),
          filePath: "",
        }

        const updatedHistory = {
          clipboardHistory: [newEntry, ...history.clipboardHistory],
        }

        yield* write(updatedHistory)
        yield* Effect.log("Added clipboard entry", { valueLength: trimmedValue.length })
      }).pipe(Effect.ensuring(releaseLockSafe))
    })

    return { read, write, writeLocked, add, historyFilePath }
  }),
}) {}
