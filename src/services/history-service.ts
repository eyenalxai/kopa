import crypto from "node:crypto"
import { mkdir, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import { Effect, Schema, Config } from "effect"

import { HistoryReadError, HistoryWriteError } from "../errors"
import { ClipboardHistory, isTextEntry, isImageEntry } from "../types"
import { createTextEntry, createImageEntry } from "../utils/entries"
import { getErrorCode } from "../utils/error-helpers"
import { createLockAcquirer, createSafeLockReleaser } from "../utils/lock"
import { loadSharp } from "../utils/sharp-loader"

export class HistoryService extends Effect.Service<HistoryService>()("HistoryService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const dataDir = join(homedir(), ".local", "share", "kopa")
    const historyFilePath = `${dataDir}/history.json`
    const lockFilePath = `${dataDir}/history.lock`
    const imagesDirPath = join(dataDir, "images")
    const lockTimeoutMs = 5_000
    const historyLimit = yield* Config.number("KOPA_HISTORY_LIMIT").pipe(Config.withDefault(1000))

    yield* Effect.tryPromise({
      try: async () => mkdir(dataDir, { recursive: true }),
      catch: (error) =>
        new HistoryWriteError({ message: `Failed to create data directory: ${String(error)}` }),
    })
    yield* Effect.tryPromise({
      try: async () => mkdir(imagesDirPath, { recursive: true }),
      catch: (error) =>
        new HistoryWriteError({ message: `Failed to create images directory: ${String(error)}` }),
    })

    const acquire = createLockAcquirer(lockFilePath, lockTimeoutMs)
    const releaseLockSafe = createSafeLockReleaser(lockFilePath)

    const cleanupOldEntries = Effect.fn("HistoryService.cleanupOldEntries")(function* (
      history: ClipboardHistory,
    ) {
      if (history.clipboardHistory.length <= historyLimit) return history
      const entriesToRemove = history.clipboardHistory.slice(historyLimit)
      const removedCount = entriesToRemove.length
      for (const entry of entriesToRemove) {
        if (isImageEntry(entry)) {
          yield* Effect.tryPromise({
            try: async () => unlink(entry.filePath),
            catch: (error) => error,
          }).pipe(
            Effect.catchAll((error) => {
              const code = getErrorCode(error)
              if (code === "ENOENT") {
                return Effect.log(`Image file already deleted: ${entry.filePath}`)
              }
              return Effect.logError(
                `Failed to delete image file: ${entry.filePath} - ${String(error)}`,
              )
            }),
          )
        }
      }
      yield* Effect.log(`Removed ${removedCount} old entries (limit: ${historyLimit})`)
      return { clipboardHistory: history.clipboardHistory.slice(0, historyLimit) }
    })

    const read = Effect.fn("HistoryService.read")(function* () {
      const file = Bun.file(historyFilePath)
      const exists = yield* Effect.tryPromise({
        try: async () => file.exists(),
        catch: (error) =>
          new HistoryReadError({ message: `Failed to check file: ${String(error)}` }),
      })
      if (!exists) return { clipboardHistory: [] }
      const rawHistory = yield* Effect.tryPromise({
        try: async () => (await file.json()) as unknown,
        catch: (error) =>
          new HistoryReadError({ message: `Failed to read history: ${String(error)}` }),
      })
      return yield* Schema.decodeUnknown(ClipboardHistory)(rawHistory).pipe(
        Effect.mapError(
          (error) => new HistoryReadError({ message: `Failed to decode: ${String(error)}` }),
        ),
      )
    })

    const write = Effect.fn("HistoryService.write")(function* (history: ClipboardHistory) {
      return yield* Effect.tryPromise({
        try: async () => Bun.write(historyFilePath, JSON.stringify(history, null, 2)),
        catch: (error) => new HistoryWriteError({ message: `Failed to write: ${String(error)}` }),
      })
    })

    const writeLocked = Effect.fn("HistoryService.writeLocked")(function* (
      history: ClipboardHistory,
    ) {
      yield* acquire()
      return yield* write(history).pipe(Effect.ensuring(releaseLockSafe))
    })

    const addText = Effect.fn("HistoryService.addText")(function* (value: string) {
      const trimmedValue = value.trim()
      if (!trimmedValue) return
      yield* acquire()
      return yield* Effect.gen(function* () {
        const history = yield* read()
        const firstEntry = history.clipboardHistory[0]
        if (firstEntry && isTextEntry(firstEntry) && firstEntry.value === trimmedValue) return
        const existingIndex = history.clipboardHistory.findIndex(
          (entry) => isTextEntry(entry) && entry.value === trimmedValue,
        )
        const id = crypto.randomUUID()
        const recorded = new Date().toISOString()
        const newEntry = yield* createTextEntry(trimmedValue, id, recorded)
        const newHistory =
          existingIndex >= 0
            ? {
                clipboardHistory: [
                  newEntry,
                  ...history.clipboardHistory.filter((_, i) => i !== existingIndex),
                ],
              }
            : { clipboardHistory: [newEntry, ...history.clipboardHistory] }
        const cleanedHistory = yield* cleanupOldEntries(newHistory)
        yield* write(cleanedHistory)
        yield* Effect.log(existingIndex >= 0 ? "Bumped text entry to top" : "Added text entry", {
          valueLength: trimmedValue.length,
        })
      }).pipe(Effect.ensuring(releaseLockSafe))
    })

    const addImage = Effect.fn("HistoryService.addImage")(function* (
      hash: string,
      buffer: Buffer,
      displayValue: string,
    ) {
      yield* acquire()
      return yield* Effect.gen(function* () {
        const history = yield* read()
        const imagePath = join(imagesDirPath, `${hash}.png`)
        const existingIndex = history.clipboardHistory.findIndex(
          (entry) => isImageEntry(entry) && entry.filePath === imagePath,
        )
        const existingImage = existingIndex >= 0 ? history.clipboardHistory[existingIndex] : null
        const firstEntry = history.clipboardHistory[0]
        if (firstEntry && isImageEntry(firstEntry) && firstEntry.filePath === imagePath) {
          yield* Effect.log("Duplicate image already at top, skipping", { hash })
          return
        }
        const sharp = yield* loadSharp()
        if (existingImage && isImageEntry(existingImage)) {
          yield* Effect.tryPromise({
            try: async () => unlink(existingImage.filePath),
            catch: (error) =>
              new HistoryWriteError({ message: `Failed to delete old image: ${String(error)}` }),
          })
        }
        yield* Effect.tryPromise({
          try: async () => sharp(buffer).png().toFile(imagePath),
          catch: (error) =>
            new HistoryWriteError({ message: `Failed to save image: ${String(error)}` }),
        })
        const id = crypto.randomUUID(),
          recorded = new Date().toISOString()
        const newEntry = yield* createImageEntry(displayValue, id, recorded, imagePath, hash)
        const newHistory =
          existingIndex >= 0
            ? {
                clipboardHistory: [
                  newEntry,
                  ...history.clipboardHistory.filter((_, i) => i !== existingIndex),
                ],
              }
            : { clipboardHistory: [newEntry, ...history.clipboardHistory] }
        const cleanedHistory = yield* cleanupOldEntries(newHistory)
        yield* write(cleanedHistory)
        yield* Effect.log(existingIndex >= 0 ? "Bumped image entry to top" : "Added image entry", {
          hash,
          path: imagePath,
        })
      }).pipe(Effect.ensuring(releaseLockSafe))
    })

    return { read, write, writeLocked, addText, addImage, historyFilePath, imagesDirPath }
  }),
}) {}
