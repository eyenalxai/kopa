import crypto from "node:crypto"
import { BunRuntime } from "@effect/platform-bun"
import { Effect, Random, Schema } from "effect"

import { HistoryService } from "../src/services/history-service"
import { TextEntry, EntryId, IsoDateString, type ClipboardHistory } from "../src/types"

const GARBAGE_TYPES = ["alphanumeric", "lorem", "numbers", "special"] as const

const generateGarbageValue = (type: (typeof GARBAGE_TYPES)[number], length: number) =>
  Effect.gen(function* () {
    switch (type) {
      case "alphanumeric": {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        let res = ""
        for (let i = 0; i < length; i++) {
          const idx = yield* Random.nextIntBetween(0, chars.length)
          res += chars[idx]
        }
        return res
      }
      case "numbers": {
        let res = ""
        for (let i = 0; i < length; i++) {
          const val = yield* Random.nextIntBetween(0, 10)
          res += val.toString()
        }
        return res
      }
      case "special": {
        const chars = "!@#$%^&*()_+[]{}|;:,.<>?/~`"
        let res = ""
        for (let i = 0; i < length; i++) {
          const idx = yield* Random.nextIntBetween(0, chars.length)
          res += chars[idx]
        }
        return res
      }
      case "lorem": {
        const words = [
          "lorem", "ipsum", "dolor", "sit", "amet", "consectetur",
          "adipiscing", "elit", "sed", "do", "eiusmod", "tempor",
          "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua",
        ]
        let res = ""
        while (res.length < length) {
          const idx = yield* Random.nextIntBetween(0, words.length)
          res += words[idx] + " "
        }
        return res.slice(0, length).trim()
      }
    }
  })

const createTextEntry = (value: string, id: string, recorded: string) =>
  Effect.gen(function* () {
    const decodedId = yield* Schema.decodeUnknown(EntryId)(id).pipe(
      Effect.mapError((error) => new Error(`Failed to decode ID: ${String(error)}`)),
    )
    const decodedRecorded = yield* Schema.decodeUnknown(IsoDateString)(recorded).pipe(
      Effect.mapError((error) => new Error(`Failed to decode date: ${String(error)}`)),
    )
    const entry = {
      _tag: "TextEntry" as const,
      id: decodedId,
      value,
      recorded: decodedRecorded,
    }
    return yield* Schema.decodeUnknown(TextEntry)(entry).pipe(
      Effect.mapError((error) => new Error(`Failed to validate entry: ${String(error)}`)),
    )
  })

const generateGarbage = (count: number) =>
  Effect.gen(function* () {
    const entries: Array<ClipboardHistory["clipboardHistory"][number]> = []
    const now = Date.now()
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000

    for (let i = 0; i < count; i++) {
      if (i > 0 && i % 10000 === 0) {
        yield* Effect.log(`Generated ${i} entries...`)
      }

      const length = yield* Random.nextIntBetween(10, 500)
      const typeIdx = yield* Random.nextIntBetween(0, GARBAGE_TYPES.length)
      const type = GARBAGE_TYPES[typeIdx]!
      const value = yield* generateGarbageValue(type, length)
      const randomTime = yield* Random.nextIntBetween(oneYearAgo, now)
      const id = crypto.randomUUID()
      const recorded = new Date(randomTime).toISOString()

      const entry = yield* createTextEntry(value, id, recorded)
      entries.push(entry)
    }
    return entries
  })

const main = Effect.gen(function* () {
  const args = process.argv.slice(2)
  const countArg = args[0]
  const parsed = countArg !== null && countArg !== undefined && countArg !== "" ? parseInt(countArg, 10) : NaN
  const count = Number.isNaN(parsed) || parsed <= 0 ? 100_000 : parsed

  yield* Effect.log(`Populating history with ${count} entries...`)

  const entries = yield* generateGarbage(count)

  const historyService = yield* HistoryService
  yield* historyService.writeLocked({ clipboardHistory: entries })

  yield* Effect.log(`Successfully wrote ${count} entries to history.`)
}).pipe(Effect.provide(HistoryService.Default))

main.pipe(BunRuntime.runMain)
