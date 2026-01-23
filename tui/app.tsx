import { TextAttributes } from "@opentui/core"
import { useQuery } from "@tanstack/react-query"
import { Effect } from "effect"
import { useMemo } from "react"

import { dbPath, getTextEntries, SqlLive, type TextEntryRow } from "./db"

export const App = () => {
  const limit = 20

  const { data, error, isLoading } = useQuery<ReadonlyArray<TextEntryRow>>({
    queryKey: ["textEntries", limit],
    queryFn: () => Effect.runPromise(getTextEntries(limit).pipe(Effect.provide(SqlLive))),
  })
  const entries = data ?? []
  const errorMessage = useMemo(() => {
    if (!error) {
      return null
    }

    if (typeof error === "string") {
      return error
    }

    if (error instanceof Error) {
      return error.message
    }

    const serialized = JSON.stringify(error)
    return serialized === undefined ? "Unknown error" : serialized
  }, [error])
  const displayError = useMemo(() => {
    if (!errorMessage) {
      return null
    }

    return errorMessage.includes("SQLITE_CANTOPEN")
      ? `Unable to open kopa db at ${dbPath}.`
      : `Failed to load clipboard entries: ${errorMessage}`
  }, [errorMessage])

  return (
    <box flexDirection="column" alignItems="stretch" flexGrow={1} padding={1}>
      <box justifyContent="center" alignItems="flex-end">
        <ascii-font font="tiny" text="OpenTUI" />
        <text attributes={TextAttributes.DIM}>What will you build?</text>
      </box>
      {displayError ? (
        <text attributes={TextAttributes.DIM}>{displayError}</text>
      ) : isLoading ? (
        <text attributes={TextAttributes.DIM}>Loading clipboard entries...</text>
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
