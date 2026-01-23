import { TextAttributes } from "@opentui/core"
import { Effect } from "effect"
import { useEffect, useState } from "react"

import { SqlLive, dbPath, getTextEntries, type TextEntryRow } from "./db"

export const App = () => {
  const [entries, setEntries] = useState<ReadonlyArray<TextEntryRow>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const formatError = (error: unknown) => {
      if (typeof error === "string") {
        return error
      }

      if (error instanceof Error) {
        return error.message
      }

      const serialized = JSON.stringify(error)
      return serialized === undefined ? "Unknown error" : serialized
    }

    Effect.runPromise(
      getTextEntries(20)
        .pipe(Effect.provide(SqlLive))
        .pipe(Effect.tapError((error) => Effect.logError(formatError(error)))),
    )
      .then((rows) => {
        if (!cancelled) {
          setEntries(rows)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const raw = err instanceof Error ? err.message : String(err)
          const isCantOpen = raw.includes("SQLITE_CANTOPEN")
          const message = isCantOpen
            ? `Unable to open kopa db at ${dbPath}.`
            : `Failed to load clipboard entries: ${raw}`
          setError(message)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <box flexDirection="column" alignItems="stretch" flexGrow={1} padding={1}>
      <box justifyContent="center" alignItems="flex-end">
        <ascii-font font="tiny" text="OpenTUI" />
        <text attributes={TextAttributes.DIM}>What will you build?</text>
      </box>
      {error ? (
        <text attributes={TextAttributes.DIM}>{error}</text>
      ) : entries.length === 0 ? (
        <text attributes={TextAttributes.DIM}>No clipboard entries yet.</text>
      ) : (
        <box flexDirection="column">
          {entries.map((entry) => (
            <text key={entry.id}>{entry.content}</text>
          ))}
        </box>
      )}
    </box>
  )
}
