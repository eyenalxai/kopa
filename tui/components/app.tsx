import { useQuery } from "@tanstack/react-query"
import { Cause, Effect } from "effect"
import { useEffect } from "react"

import { dbPath, getTextEntries, SqlLive, type TextEntryRow } from "../lib/db"
import { logError } from "../lib/logger"

import { ClipboardList } from "./clipboard-list"
import { ContentError } from "./error"
import { useToast } from "./toast"

export const App = () => {
  const limit = 20
  const { show } = useToast()

  useEffect(() => {
    const messages: ReadonlyArray<string> = [
      "Ready to capture new clipboard entries.",
      "Tip: Click to copy from history.",
      "Synced clipboard is up and running.",
      "Search your clipboard with the list view.",
    ]

    const message =
      messages[Math.floor(Math.random() * messages.length)] ??
      "Ready to capture new clipboard entries."
    const variant = "error"
    show({ title: "error", message: "test toast test toast test toast test toast", variant })
    logError(message)
  }, [show])

  const {
    data: entries,
    error,
    isPending,
  } = useQuery<ReadonlyArray<TextEntryRow>>({
    queryKey: ["textEntries", limit],
    queryFn: () =>
      Effect.runPromise(
        getTextEntries(limit).pipe(
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
    return <text>Loading clipboard entries...</text>
  }

  if (entries.length === 0) {
    return <text>No clipboard entries yet.</text>
  }

  return <ClipboardList entries={entries} />
}
