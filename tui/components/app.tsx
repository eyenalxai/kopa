import { keepPreviousData, useInfiniteQuery, type InfiniteData } from "@tanstack/react-query"
import { Effect } from "effect"
import { useMemo, useState } from "react"
import { useDebounceValue } from "usehooks-ts"

import { getTextEntries, searchTextEntries, socketPath, type EntriesPage } from "../lib/db"

import { ClipboardList } from "./clipboard-list"
import { ContentError } from "./error"

export const App = () => {
  const [searchQuery, setSearchQuery] = useState("")
  const trimmedQuery = useMemo(() => searchQuery.trim(), [searchQuery])
  const [debouncedQuery] = useDebounceValue(trimmedQuery, 150)
  const queryKey: ["textEntries", string] = ["textEntries", debouncedQuery]
  const { data, error, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<
      EntriesPage,
      Error,
      InfiniteData<EntriesPage, number | undefined>,
      ["textEntries", string],
      number | undefined
    >({
    queryKey,
    queryFn: ({ pageParam }) =>
      Effect.runPromise(
        debouncedQuery
          ? searchTextEntries(debouncedQuery, pageParam)
          : getTextEntries(pageParam),
      ),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  })
  const entries = useMemo(() => data?.pages.flatMap((page) => page.entries) ?? [], [data])

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

  if (isPending && !data) {
    return <text>Loading clipboard entries...</text>
  }

  return (
    <ClipboardList
      entries={entries}
      searchQuery={searchQuery}
      onSearch={setSearchQuery}
      onLoadMore={() => {
        if (hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      }}
      hasMore={hasNextPage ?? false}
      isLoadingMore={isFetchingNextPage}
    />
  )
}
