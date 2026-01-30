import type { ClipboardEntry } from "../src/types"
import { BunRuntime } from "@effect/platform-bun"
import { Effect, Random } from "effect"

import { HistoryService } from "../src/services/history-service"

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
          "lorem",
          "ipsum",
          "dolor",
          "sit",
          "amet",
          "consectetur",
          "adipiscing",
          "elit",
          "sed",
          "do",
          "eiusmod",
          "tempor",
          "incididunt",
          "ut",
          "labore",
          "et",
          "dolore",
          "magna",
          "aliqua",
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

const generateGarbage = (count: number) =>
  Effect.gen(function* () {
    const entries: ClipboardEntry[] = []
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

      entries.push({
        value,
        recorded: new Date(randomTime).toISOString(),
        filePath: "null",
      })
    }
    return entries
  })

const main = Effect.gen(function* () {
  const args = process.argv.slice(2)
  const count = args[0] ? parseInt(args[0], 10) : 100_000

  yield* Effect.log(`Populating history with ${count} entries...`)

  const entries = yield* generateGarbage(count)

  const historyService = yield* HistoryService
  yield* historyService.write({ clipboardHistory: entries })

  yield* Effect.log(`Successfully wrote ${count} entries to history.`)
}).pipe(Effect.provide(HistoryService.Default))

main.pipe(BunRuntime.runMain)
