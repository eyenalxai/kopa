import { useQuery } from "@tanstack/react-query"
import { Cause, Effect } from "effect"

import { dbPath, getTextEntries, SqlLive, type TextEntryRow } from "../lib/db"

import { ClipboardList } from "./clipboard-list"
import { ContentError } from "./error"

export const App = () => {
  const {
    data: entries,
    error,
    isPending,
  } = useQuery<ReadonlyArray<TextEntryRow>>({
    queryKey: ["textEntries"],
    queryFn: () =>
      Effect.runPromise(
        getTextEntries().pipe(
          Effect.provide(SqlLive),
          Effect.catchAllCause((cause) => Effect.fail(new Error(Cause.pretty(cause)))),
        ),
      ),
  })

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

    return <ContentError title="Error loading clipboard entries">{displayError}</ContentError>
  }

  if (isPending) {
    return null
  }

  if (entries.length === 0) {
    return <text>No clipboard entries yet.</text>
  }

  return <ClipboardList entries={entries} />
}
