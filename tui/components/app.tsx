import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Effect } from "effect"
import { useMemo, useState } from "react"
import { useDebounceValue } from "usehooks-ts"

import { getTextEntries, searchTextEntries, socketPath, type TextEntryRow } from "../lib/db"

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
      Effect.runPromise(debouncedQuery ? searchTextEntries(debouncedQuery) : getTextEntries()),
    placeholderData: keepPreviousData,
  })

  if (error) {
    const errorMessage =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : (JSON.stringify(error) ?? "Unknown error")
    const displayError =
      errorMessage.includes("ENOENT") || errorMessage.includes("ECONNREFUSED")
        ? `Unable to connect to kopa daemon at ${socketPath}.`
        : `Failed to load clipboard entries: ${errorMessage}`

    return <ContentError title="Error loading clipboard entries">{displayError}</ContentError>
  }

  if (isPending && !entries) {
    return <text>Loading clipboard entries...</text>
  }

  return (
    <ClipboardList entries={entries ?? []} searchQuery={searchQuery} onSearch={setSearchQuery} />
  )
}
