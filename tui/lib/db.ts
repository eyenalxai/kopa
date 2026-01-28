import { connect } from "node:net"
import { homedir } from "node:os"
import { join } from "node:path"

import { Effect, Schema } from "effect"

export const socketPath = join(homedir(), ".local/share/kopa/kopa.sock")

type PaginationParams = {
  readonly cursor?: number
  readonly limit?: number
}

type Request =
  | {
      readonly type: "list_entries"
      readonly data?: PaginationParams
    }
  | {
      readonly type: "search_entries"
      readonly data: {
        readonly query: string
        readonly cursor?: number
        readonly limit?: number
      }
    }
  | {
      readonly type: "copy_to_clipboard"
      readonly data: {
        readonly entry_id: number
      }
    }

const TextEntryRowSchema = Schema.Struct({
  id: Schema.Number,
  content: Schema.String,
  created_at: Schema.Number,
})

export type TextEntryRow = Schema.Schema.Type<typeof TextEntryRowSchema>

export type EntriesPage = {
  readonly entries: ReadonlyArray<TextEntryRow>
  readonly nextCursor: number | null
}

const EntriesResponseSchema = Schema.Struct({
  type: Schema.Literal("entries"),
  data: Schema.Struct({
    entries: Schema.Array(TextEntryRowSchema),
    next_cursor: Schema.NullOr(Schema.Number),
  }),
})

const SuccessResponseSchema = Schema.Struct({
  type: Schema.Literal("success"),
})

const ErrorResponseSchema = Schema.Struct({
  type: Schema.Literal("error"),
  data: Schema.Struct({
    message: Schema.String,
  }),
})

const ResponseSchema = Schema.Union(EntriesResponseSchema, SuccessResponseSchema, ErrorResponseSchema)

const parseResponse = (payload: string) =>
  Effect.try(() => JSON.parse(payload)).pipe(
    Effect.flatMap((parsed) => Schema.decodeUnknown(ResponseSchema)(parsed)),
    Effect.mapError((error) => new Error(`Invalid response from daemon: ${String(error)}`)),
  )

const decodeEntriesResponse = (payload: string) =>
  parseResponse(payload).pipe(
    Effect.flatMap((response) => {
      if (response.type === "error") {
        return Effect.fail(new Error(response.data.message))
      }
      if (response.type !== "entries") {
        return Effect.fail(new Error("Unexpected response from daemon"))
      }
      return Effect.succeed({
        entries: response.data.entries,
        nextCursor: response.data.next_cursor,
      })
    }),
  )

const decodeSuccessResponse = (payload: string) =>
  parseResponse(payload).pipe(
    Effect.flatMap((response) => {
      if (response.type === "error") {
        return Effect.fail(new Error(response.data.message))
      }
      if (response.type !== "success") {
        return Effect.fail(new Error("Unexpected response from daemon"))
      }
      return Effect.succeed(undefined)
    }),
  )

const sendRequest = <A>(request: Request, decode: (payload: string) => Effect.Effect<A, Error>) =>
  Effect.async<A, Error>((resume) => {
    const socket = connect({ path: socketPath })
    let buffer = ""
    let settled = false

    const fail = (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      socket.removeAllListeners()
      socket.end()
      resume(Effect.fail(error))
    }

    socket.setEncoding("utf8")
    socket.on("error", (error) => {
      fail(error instanceof Error ? error : new Error("Socket error"))
    })
    socket.on("data", (chunk) => {
      buffer += chunk
      const newlineIndex = buffer.indexOf("\n")
      if (newlineIndex === -1) {
        return
      }

      const line = buffer.slice(0, newlineIndex)
      settled = true
      socket.removeAllListeners()
      socket.end()
      resume(decode(line))
    })
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`)
    })
    return Effect.sync(() => {
      if (settled) {
        return
      }
      settled = true
      socket.removeAllListeners()
      socket.end()
    })
  })

export const getTextEntries = (cursor?: number, limit?: number) =>
  sendRequest({
    type: "list_entries",
    data: { cursor, limit },
  }, decodeEntriesResponse)

export const searchTextEntries = (query: string, cursor?: number, limit?: number) =>
  sendRequest({ type: "search_entries", data: { query, cursor, limit } }, decodeEntriesResponse)

export const copyToClipboard = (entryId: number) =>
  sendRequest(
    {
      type: "copy_to_clipboard",
      data: { entry_id: entryId },
    },
    decodeSuccessResponse,
  )
