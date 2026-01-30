import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"

import { Effect, Config, Schema } from "effect"

import { HistoryReadError, HistoryWriteError } from "../errors"
import { ClipboardHistory, type ClipboardEntry } from "../types"

export class HistoryService extends Effect.Service<HistoryService>()("HistoryService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const dataDir = yield* Config.string("KOPA_DATA_DIR").pipe(
      Config.withDefault(`${homedir()}/.config/kopa`),
    )

    const historyFilePath = `${dataDir}/history.json`

    const ensureDir = Effect.fn("HistoryService.ensureDir")(function* () {
      yield* Effect.promise(async () => mkdir(dataDir, { recursive: true }))
    })

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

    const add = Effect.fn("HistoryService.add")(function* (value: string) {
      const history = yield* read()

      if (!value || value.trim().length === 0) {
        return
      }

      const newEntry: ClipboardEntry = {
        value: value.trim(),
        recorded: new Date().toISOString(),
        filePath: "null",
      }

      const updatedHistory = {
        clipboardHistory: [newEntry, ...history.clipboardHistory],
      }

      yield* write(updatedHistory)
      yield* Effect.log("Added clipboard entry", { valueLength: value.length })
    })

    return { read, write, add, historyFilePath }
  }),
}) {}
