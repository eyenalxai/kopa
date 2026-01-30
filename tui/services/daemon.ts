import { homedir } from "node:os"

import { Effect } from "effect"

const dataDir = `${homedir()}/.config/kopa`
const historyFilePath = `${dataDir}/history.json`

/**
 * Filters clipboard entries using fzf's fuzzy matching algorithm.
 * Falls back to substring matching if fzf is not available.
 */
const fzfFilter = Effect.fn("fzfFilter")(function* (
  query: string,
  entries: ReadonlyArray<ClipboardEntry>,
) {
  // Empty query - return all entries
  if (!query.trim()) {
    return entries
  }

  // Try to use fzf for fuzzy matching
  return yield* Effect.gen(function* () {
    const proc = Bun.spawn(["fzf", "--filter", query, "-i", "--read0", "--print0"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })

    // Write entries to stdin (NUL-delimited for multi-line support)
    const input = entries.map((e) => e.value).join("\0")
    yield* Effect.promise(async () => proc.stdin.write(input))
    yield* Effect.promise(async () => proc.stdin.end())

    // Read stdout concurrently with waiting for process to exit
    const stdoutChunks: Uint8Array[] = []
    const stdoutReader = proc.stdout.getReader()

    const readStdout = Effect.gen(function* () {
      while (true) {
        const { done, value } = yield* Effect.promise(async () => stdoutReader.read())
        if (done) break
        if (value) stdoutChunks.push(value)
      }
    })

    // Wait for both stdout reading and process exit
    const [_, exitCode] = yield* Effect.all([readStdout, Effect.promise(async () => proc.exited)])

    // If fzf failed (non-zero exit code), fall back to substring matching
    if (exitCode !== 0) {
      yield* Effect.log("fzf not available, falling back to substring search")
      const lowerQuery = query.toLowerCase()
      return entries.filter((e) => e.value.toLowerCase().includes(lowerQuery))
    }

    const output = Buffer.concat(stdoutChunks).toString("utf-8")
    const matchedValues = output.split("\0").filter((v) => v.length > 0)

    // Map matched values back to entries (preserve order)
    const matchedSet = new Set(matchedValues)
    const matchedEntries = entries.filter((e) => matchedSet.has(e.value))

    return matchedEntries
  }).pipe(
    Effect.catchAll(() =>
      Effect.gen(function* () {
        yield* Effect.log("fzf error, falling back to substring search")
        const lowerQuery = query.toLowerCase()
        return entries.filter((e) => e.value.toLowerCase().includes(lowerQuery))
      }),
    ),
  )
})

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
    const exists = yield* Effect.promise(async () => file.exists())

    if (!exists) {
      return { entries: [], nextCursor: null }
    }

    const history = yield* Effect.tryPromise({
      try: async () => file.json() as Promise<{ clipboardHistory: ClipboardEntry[] }>,
      catch: (error) => new Error(`Failed to read history: ${String(error)}`),
    })

    let entries = history.clipboardHistory

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
    const exists = yield* Effect.promise(async () => file.exists())

    if (!exists) {
      return { entries: [], nextCursor: null }
    }

    const history = yield* Effect.tryPromise({
      try: async () => file.json() as Promise<{ clipboardHistory: ClipboardEntry[] }>,
      catch: (error) => new Error(`Failed to read history: ${String(error)}`),
    })

    // Use fzf for fuzzy matching (with fallback to substring search)
    let entries = yield* fzfFilter(query, history.clipboardHistory)

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

    yield* Effect.promise(async () => proc.stdin.write(content))
    yield* Effect.promise(async () => proc.stdin.end())

    const exitCode = yield* Effect.promise(async () => proc.exited)

    if (exitCode !== 0) {
      yield* Effect.fail(new Error(`wl-copy exited with code ${exitCode}`))
    }
  })
