import crypto from "node:crypto"
import { mkdir, open, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import { Effect, Schema, Config } from "effect"
import type sharp from "sharp"

import { HistoryReadError, HistoryWriteError, SharpLoadError } from "../errors"
import {
  ClipboardHistory,
  TextEntry,
  ImageEntry,
  isTextEntry,
  isImageEntry,
  EntryId,
  ImageHash,
  IsoDateString,
  AbsolutePath,
} from "../types"

const hasErrorCode = (value: unknown): value is { code?: unknown } =>
  typeof value === "object" && value !== null && "code" in value

const getErrorCode = (error: unknown): string | null => {
  if (hasErrorCode(error)) {
    return typeof error.code === "string" ? error.code : null
  }
  return null
}

const decodeEntryField = <A, I>(
  schema: Schema.Schema<A, I>,
  value: I,
  fieldName: string,
): Effect.Effect<A, HistoryWriteError> =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      (error) =>
        new HistoryWriteError({ message: `Failed to decode ${fieldName}: ${String(error)}` }),
    ),
  )

const createTextEntry = (value: string, id: string, recorded: string) =>
  Effect.gen(function* () {
    const decodedId = yield* decodeEntryField(EntryId, id, "entry ID")
    const decodedRecorded = yield* decodeEntryField(IsoDateString, recorded, "recorded date")
    const entry = { _tag: "TextEntry" as const, id: decodedId, value, recorded: decodedRecorded }
    return yield* decodeEntryField(TextEntry, entry, "text entry")
  })

const createImageEntry = (
  value: string,
  id: string,
  recorded: string,
  filePath: string,
  hash: string,
) =>
  Effect.gen(function* () {
    const decodedId = yield* decodeEntryField(EntryId, id, "entry ID")
    const decodedRecorded = yield* decodeEntryField(IsoDateString, recorded, "recorded date")
    const decodedPath = yield* decodeEntryField(AbsolutePath, filePath, "image path")
    const decodedHash = yield* decodeEntryField(ImageHash, hash, "image hash")
    const entry = {
      _tag: "ImageEntry" as const,
      id: decodedId,
      value,
      recorded: decodedRecorded,
      filePath: decodedPath,
      hash: decodedHash,
    }
    return yield* decodeEntryField(ImageEntry, entry, "image entry")
  })

type SharpModule = { default?: typeof sharp } & typeof sharp

const isSharpModule = (mod: unknown): mod is SharpModule => {
  if (typeof mod !== "object" || mod === null) return false
  const hasDefault =
    "default" in mod && typeof (mod as { default?: unknown }).default === "function"
  const isCallable = typeof mod === "function"
  return hasDefault || isCallable
}

export class HistoryService extends Effect.Service<HistoryService>()("HistoryService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const dataDir = join(homedir(), ".local", "share", "kopa")
    const historyFilePath = `${dataDir}/history.json`
    const lockFilePath = `${dataDir}/history.lock`
    const imagesDirPath = join(dataDir, "images")
    const lockTimeoutMs = 5_000

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

    const loadSharp = Effect.fn("HistoryService.loadSharp")(function* () {
      const sharpPath = yield* Config.string("SHARP_PATH").pipe(Config.withDefault(""))
      const load = async (path: string) => {
        const mod: unknown = await import(path)
        if (!isSharpModule(mod)) throw new Error(`Invalid sharp module at ${path}`)
        return mod.default ?? mod
      }
      if (sharpPath !== "") {
        return yield* Effect.tryPromise({
          try: () => load(sharpPath),
          catch: (error) =>
            new SharpLoadError({
              message: `Failed to load sharp: ${String(error)}`,
              path: sharpPath,
            }),
        })
      }
      return yield* Effect.tryPromise({
        try: () => load("sharp"),
        catch: (error) => new SharpLoadError({ message: `Failed to load sharp: ${String(error)}` }),
      })
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

    const releaseLock = Effect.fn("HistoryService.releaseLock")(function* () {
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
    const releaseLockSafe = releaseLock().pipe(Effect.catchAll(() => Effect.void))

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
      yield* acquireLock()
      return yield* write(history).pipe(Effect.ensuring(releaseLockSafe))
    })

    const addText = Effect.fn("HistoryService.addText")(function* (value: string) {
      const trimmedValue = value.trim()
      if (!trimmedValue) return
      yield* acquireLock()
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
        if (existingIndex >= 0) {
          const filtered = history.clipboardHistory.filter((_, i) => i !== existingIndex)
          yield* write({ clipboardHistory: [newEntry, ...filtered] })
          yield* Effect.log("Bumped text entry to top", { valueLength: trimmedValue.length })
        } else {
          yield* write({ clipboardHistory: [newEntry, ...history.clipboardHistory] })
          yield* Effect.log("Added text entry", { valueLength: trimmedValue.length })
        }
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
        const id = crypto.randomUUID()
        const recorded = new Date().toISOString()
        const newEntry = yield* createImageEntry(displayValue, id, recorded, imagePath, hash)
        if (existingIndex >= 0) {
          const filtered = history.clipboardHistory.filter((_, i) => i !== existingIndex)
          yield* write({ clipboardHistory: [newEntry, ...filtered] })
          yield* Effect.log("Bumped image entry to top", { hash, path: imagePath })
        } else {
          yield* write({ clipboardHistory: [newEntry, ...history.clipboardHistory] })
          yield* Effect.log("Added image entry", { hash, path: imagePath })
        }
      }).pipe(Effect.ensuring(releaseLockSafe))
    })

    return { read, write, writeLocked, addText, addImage, historyFilePath, imagesDirPath }
  }),
}) {}
