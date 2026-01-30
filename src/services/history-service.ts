import { mkdir, open, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import { Effect, Schema } from "effect"
import type sharp from "sharp"

// Type definition for dynamically imported sharp module
// Sharp uses CommonJS (module.exports), so when imported via ESM it has both:
// - mod.default: the sharp function (ESM interop)
// - mod: the sharp function itself (when imported directly)
type SharpModule = {
  default?: typeof sharp
} & typeof sharp

// Type guard to validate that a dynamically imported module is a valid sharp module
const isSharpModule = (mod: unknown): mod is SharpModule => {
  if (typeof mod !== "object" || mod === null) {
    return false
  }

  // Check if it's callable (the sharp function) or has a default export
  const hasDefault =
    "default" in mod && typeof (mod as { default?: unknown }).default === "function"
  const isCallable = typeof mod === "function"

  return hasDefault || isCallable
}

// Sharp loader that supports both dev and production (compiled binary)
// Production path is set via SHARP_PATH environment variable
const loadSharp = Effect.fn("HistoryService.loadSharp")(function* () {
  const sharpPath = process.env.SHARP_PATH

  if (sharpPath !== undefined && sharpPath !== "") {
    const sharpModule = yield* Effect.tryPromise({
      try: async () => {
        const mod: unknown = await import(sharpPath)

        if (!isSharpModule(mod)) {
          throw new Error(`Module at ${sharpPath} is not a valid sharp module`)
        }

        return mod.default ?? mod
      },
      catch: (error: unknown) =>
        new SharpLoadError({
          message: `Failed to load sharp from SHARP_PATH: ${String(error)}`,
          path: sharpPath,
        }),
    })
    return sharpModule
  }

  // Fall back to default import (works in dev mode)
  const sharpModule = yield* Effect.tryPromise({
    try: async () => {
      const mod: unknown = await import("sharp")

      if (!isSharpModule(mod)) {
        throw new Error("Default sharp module is not valid")
      }

      return mod.default ?? mod
    },
    catch: (error: unknown) =>
      new SharpLoadError({
        message: `Failed to load sharp from default path: ${String(error)}`,
      }),
  })
  return sharpModule
})

import { HistoryReadError, HistoryWriteError, SharpLoadError } from "../errors"
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
    const dataDir = join(homedir(), ".local", "share", "kopa")

    const historyFilePath = `${dataDir}/history.json`
    const lockFilePath = `${dataDir}/history.lock`
    const imagesDirPath = join(dataDir, "images")
    const lockTimeoutMs = 5_000

    // Initialize directories at service startup
    yield* Effect.tryPromise({
      try: async () => mkdir(dataDir, { recursive: true }),
      catch: (error) =>
        new HistoryWriteError({
          message: `Failed to create data directory: ${String(error)}`,
        }),
    })
    yield* Effect.tryPromise({
      try: async () => mkdir(imagesDirPath, { recursive: true }),
      catch: (error) =>
        new HistoryWriteError({
          message: `Failed to create images directory: ${String(error)}`,
        }),
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

    const addText = Effect.fn("HistoryService.addText")(function* (value: string) {
      const trimmedValue = value.trim()
      if (!trimmedValue) {
        return
      }

      yield* acquireLock()
      return yield* Effect.gen(function* () {
        const history = yield* read()

        const firstEntry = history.clipboardHistory[0]
        if (firstEntry?.type === "text" && firstEntry.value === trimmedValue) {
          return
        }

        const newEntry: ClipboardEntry = {
          type: "text",
          value: trimmedValue,
          recorded: new Date().toISOString(),
          filePath: "",
        }

        const updatedHistory = {
          clipboardHistory: [newEntry, ...history.clipboardHistory],
        }

        yield* write(updatedHistory)
        yield* Effect.log("Added text clipboard entry", { valueLength: trimmedValue.length })
      }).pipe(Effect.ensuring(releaseLockSafe))
    })

    const addImage = Effect.fn("HistoryService.addImage")(function* (
      hash: string,
      buffer: Buffer,
      displayValue: string,
    ) {
      yield* acquireLock()
      return yield* Effect.gen(function* () {
        const history = yield* read()

        const imagePath = join(imagesDirPath, `${hash}.png`)

        // Check for duplicate by hash (filePath contains the hash)
        const existingImage = history.clipboardHistory.find(
          (entry) => entry.type === "image" && entry.filePath === imagePath,
        )
        if (existingImage) {
          yield* Effect.log("Duplicate image detected, skipping", { hash })
          return
        }

        // Load sharp and convert to PNG
        const sharp = yield* loadSharp()
        yield* Effect.tryPromise({
          try: async () => {
            await sharp(buffer).png().toFile(imagePath)
          },
          catch: (error) =>
            new HistoryWriteError({
              message: `Failed to save image: ${String(error)}`,
            }),
        })

        const newEntry: ClipboardEntry = {
          type: "image",
          value: displayValue,
          recorded: new Date().toISOString(),
          filePath: imagePath,
        }

        const updatedHistory = {
          clipboardHistory: [newEntry, ...history.clipboardHistory],
        }

        yield* write(updatedHistory)
        yield* Effect.log("Added image clipboard entry", { hash, path: imagePath })
      }).pipe(Effect.ensuring(releaseLockSafe))
    })

    return { read, write, writeLocked, addText, addImage, historyFilePath, imagesDirPath }
  }),
}) {}
