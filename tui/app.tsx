import { useQuery } from "@tanstack/react-query"
import { Cause, Effect } from "effect"

import { dbPath, getTextEntries, SqlLive, type TextEntryRow } from "./db"

export const App = () => {
  const limit = 20

  const { data, error, isPending } = useQuery<ReadonlyArray<TextEntryRow>>({
    queryKey: ["textEntries", limit],
    queryFn: () =>
      Effect.runPromise(
        getTextEntries(limit).pipe(
          Effect.provide(SqlLive),
          Effect.catchAllCause((cause) => Effect.fail(new Error(Cause.pretty(cause)))),
        ),
      ),
  })
  const entries = data ?? []
  if (error) {
    const errorMessage =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : (JSON.stringify(error) ?? "Unknown error")
    const displayError = errorMessage.includes("SQLITE_CANTOPEN")
      ? `Unable to open kopa db at ${dbPath}.`
      : `Failed to load clipboard entries: ${errorMessage}`

    return <text>{displayError}</text>
  }

  if (isPending) {
    return <text>Loading clipboard entries...</text>
  }

  if (entries.length === 0) {
    return <text>No clipboard entries yet.</text>
  }

  return (
    <box flexDirection="column">
      {entries.map((entry) => (
        <text key={entry.id}>{entry.content}</text>
      ))}
    </box>
  )
}
