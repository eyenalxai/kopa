import "opentui-spinner/react"

import { keepPreviousData, useInfiniteQuery, type InfiniteData } from "@tanstack/react-query"
import { Effect } from "effect"
import { useMemo, useState, type ReactNode } from "react"
import { useDebounceValue } from "usehooks-ts"

import { getEntries, searchEntries, type EntriesPage } from "../services/daemon"

import { ClipboardList } from "./clipboard-list"
import { ContentError } from "./error"

export const App = (): ReactNode => {
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
      queryFn: async ({ pageParam }) =>
        Effect.runPromise(
          debouncedQuery ? searchEntries(debouncedQuery, pageParam) : getEntries(pageParam),
        ),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      placeholderData: keepPreviousData,
    })
  const entries = useMemo(() => data?.pages.flatMap((page) => page.entries) ?? [], [data])

  if (error) {
    const errorMessage = error.message
    const displayError = `Failed to load clipboard entries: ${errorMessage}`

    return <ContentError title="Error loading clipboard entries">{displayError}</ContentError>
  }

  if (isPending && entries.length === 0) {
    return null
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
