import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Cause, Effect } from "effect"
import { useMemo, useState } from "react"
import { useDebounceValue } from "usehooks-ts"

import { dbPath, getTextEntries, searchTextEntries, SqlLive, type TextEntryRow } from "../lib/db"

import { ClipboardList } from "./clipboard-list"
import { ContentError } from "./error"

export const App = () => {
  const [searchQuery, setSearchQuery] = useState("")
  const trimmedQuery = useMemo(() => searchQuery.trim(), [searchQuery])
  const [debouncedQuery] = useDebounceValue(trimmedQuery, 150)
  const {
    data: entries,
    error,
    isPending,
  } = useQuery<ReadonlyArray<TextEntryRow>>({
    queryKey: ["textEntries", debouncedQuery],
    queryFn: () =>
      Effect.runPromise(
        (debouncedQuery ? searchTextEntries(debouncedQuery) : getTextEntries()).pipe(
          Effect.provide(SqlLive),
          Effect.catchAllCause((cause) => Effect.fail(new Error(Cause.pretty(cause)))),
        ),
      ),
    placeholderData: keepPreviousData,
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

  if (isPending && !entries) {
    return <text>Loading clipboard entries...</text>
  }

  return (
    <ClipboardList
      entries={entries ?? []}
      searchQuery={searchQuery}
      onSearch={setSearchQuery}
    />
  )
}
