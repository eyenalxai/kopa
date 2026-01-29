import { homedir } from "node:os"

import { Effect } from "effect"

const dataDir = `${homedir()}/.config/kopa`
const historyFilePath = `${dataDir}/history.json`

export interface ClipboardEntry {
  value: string
  recorded: string
  filePath: string
}

export type EntriesPage = {
  readonly entries: ReadonlyArray<ClipboardEntry>
  readonly nextCursor: number | null
}

export const getEntries = (
  cursor?: number,
  limit: number = 50,
): Effect.Effect<EntriesPage, Error> =>
  Effect.gen(function* () {
    const file = Bun.file(historyFilePath)
    const exists = yield* Effect.promise(() => file.exists())

    if (!exists) {
      return { entries: [], nextCursor: null }
    }

    const history = yield* Effect.tryPromise({
      try: () => file.json() as Promise<{ clipboardHistory: ClipboardEntry[] }>,
      catch: (error) => new Error(`Failed to read history: ${String(error)}`),
    })

    let entries = history.clipboardHistory

    // Simple pagination by index
    if (cursor !== undefined) {
      entries = entries.slice(cursor)
    }

    const hasMore = entries.length > limit
    const resultEntries = entries.slice(0, limit)
    const nextCursor = hasMore ? (cursor ?? 0) + limit : null

    return {
      entries: resultEntries,
      nextCursor,
    }
  })

export const searchEntries = (
  query: string,
  cursor?: number,
  limit: number = 50,
): Effect.Effect<EntriesPage, Error> =>
  Effect.gen(function* () {
    const file = Bun.file(historyFilePath)
    const exists = yield* Effect.promise(() => file.exists())

    if (!exists) {
      return { entries: [], nextCursor: null }
    }

    const history = yield* Effect.tryPromise({
      try: () => file.json() as Promise<{ clipboardHistory: ClipboardEntry[] }>,
      catch: (error) => new Error(`Failed to read history: ${String(error)}`),
    })

    const lowerQuery = query.toLowerCase()
    let entries = history.clipboardHistory.filter((e) => e.value.toLowerCase().includes(lowerQuery))

    // Pagination
    if (cursor !== undefined) {
      entries = entries.slice(cursor)
    }

    const hasMore = entries.length > limit
    const resultEntries = entries.slice(0, limit)
    const nextCursor = hasMore ? (cursor ?? 0) + limit : null

    return {
      entries: resultEntries,
      nextCursor,
    }
  })

export const copyToClipboard = (content: string): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const proc = Bun.spawn(["wl-copy"], {
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
    })

    yield* Effect.promise(() => Promise.resolve(proc.stdin.write(content)))
    yield* Effect.promise(() => Promise.resolve(proc.stdin.end()))

    const exitCode = yield* Effect.promise(() => Promise.resolve(proc.exited))

    if (exitCode !== 0) {
      yield* Effect.fail(new Error(`wl-copy exited with code ${exitCode}`))
    }
  })
