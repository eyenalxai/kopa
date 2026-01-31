import { open, unlink } from "node:fs/promises"

import { Effect } from "effect"

import { HistoryWriteError } from "../errors"

import { getErrorCode } from "./error-helpers"

export const createLockAcquirer = (lockFilePath: string, lockTimeoutMs: number) =>
  Effect.fn("Lock.createLockAcquirer")(function* () {
    const startedAt = Date.now()
    while (true) {
      const acquired = yield* Effect.tryPromise({
        try: async () => {
          try {
            const handle = await open(lockFilePath, "wx")
            await handle.close()
            return true
          } catch (error) {
            if (getErrorCode(error) === "EEXIST") return false
            throw error
          }
        },
        catch: (error) =>
          new HistoryWriteError({ message: `Failed to acquire lock: ${String(error)}` }),
      })
      if (acquired) return
      if (Date.now() - startedAt >= lockTimeoutMs) {
        return yield* Effect.fail(
          new HistoryWriteError({ message: `Lock timeout after ${lockTimeoutMs}ms` }),
        )
      }
      yield* Effect.sleep("50 millis")
    }
  })

const createLockReleaser = (lockFilePath: string) =>
  Effect.fn("Lock.createLockReleaser")(function* () {
    yield* Effect.tryPromise({
      try: async () => {
        try {
          await unlink(lockFilePath)
        } catch (error) {
          if (getErrorCode(error) !== "ENOENT") throw error
        }
      },
      catch: (error) =>
        new HistoryWriteError({ message: `Failed to release lock: ${String(error)}` }),
    })
  })

export const createSafeLockReleaser = (lockFilePath: string) =>
  createLockReleaser(lockFilePath)().pipe(Effect.catchAll(() => Effect.void))
