import { connect } from "node:net"
import { homedir } from "node:os"
import { join } from "node:path"

import { Effect, Schema } from "effect"

export const socketPath = join(homedir(), ".local/share/kopa/kopa.sock")

type Request =
  | {
      readonly type: "list_entries"
    }
  | {
      readonly type: "search_entries"
      readonly data: {
        readonly query: string
      }
    }

const TextEntryRowSchema = Schema.Struct({
  id: Schema.Number,
  content: Schema.String,
  created_at: Schema.Number,
})

export type TextEntryRow = Schema.Schema.Type<typeof TextEntryRowSchema>

const EntriesResponseSchema = Schema.Struct({
  type: Schema.Literal("entries"),
  data: Schema.Struct({
    entries: Schema.Array(TextEntryRowSchema),
  }),
})

const ErrorResponseSchema = Schema.Struct({
  type: Schema.Literal("error"),
  data: Schema.Struct({
    message: Schema.String,
  }),
})

const ResponseSchema = Schema.Union(EntriesResponseSchema, ErrorResponseSchema)

const decodeResponse = (payload: string) =>
  Effect.try(() => JSON.parse(payload)).pipe(
    Effect.flatMap((parsed) => Schema.decodeUnknown(ResponseSchema)(parsed)),
    Effect.mapError((error) => new Error(`Invalid response from daemon: ${String(error)}`)),
    Effect.flatMap((response) =>
      response.type === "error"
        ? Effect.fail(new Error(response.data.message))
        : Effect.succeed(response.data.entries),
    ),
  )

const sendRequest = (request: Request) =>
  Effect.async<ReadonlyArray<TextEntryRow>, Error>((resume) => {
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
      resume(decodeResponse(line))
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

export const getTextEntries = () => sendRequest({ type: "list_entries" })

export const searchTextEntries = (query: string) =>
  sendRequest({ type: "search_entries", data: { query } })
