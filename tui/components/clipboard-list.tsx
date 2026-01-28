import type { TextEntryRow } from "../services/daemon"
import type { SelectRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { Effect } from "effect"
import { useMemo, useRef, useState } from "react"

import { useTheme } from "../providers/theme"
import { useToast } from "../providers/toast"
import { copyToClipboard } from "../services/daemon"
import { logError } from "../services/logger"
import { formatTimestamp, truncateContent } from "../utils/format"

import { SearchInput } from "./search-input"

type ClipboardListProps = {
  readonly entries: ReadonlyArray<TextEntryRow>
  readonly searchQuery: string
  readonly onSearch: (query: string) => void
  readonly onLoadMore: () => void
  readonly hasMore: boolean
  readonly isLoadingMore: boolean
}

export const ClipboardList = ({
  entries,
  searchQuery,
  onSearch,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: ClipboardListProps) => {
  const theme = useTheme()
  const toast = useToast()
  const selectRef = useRef<SelectRenderable>(null)
  const [focusedElement, setFocusedElement] = useState<"input" | "list">("input")
  const entriesById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const hasEntries = entries.length > 0
  const options = useMemo(
    () =>
      entries.map((entry) => ({
        name: truncateContent(entry.content),
        description: formatTimestamp(entry.created_at),
        value: entry.id,
      })),
    [entries],
  )

  useKeyboard((key) => {
    if (key.name === "tab") {
      setFocusedElement((prev) => (prev === "input" ? "list" : "input"))
    } else if (key.name === "escape") {
      if (searchQuery) {
        onSearch("")
      }
      setFocusedElement("list")
    } else if (focusedElement === "list" && selectRef.current) {
      if (key.name === "pageup") {
        selectRef.current.moveUp(10)
      } else if (key.name === "pagedown") {
        selectRef.current.moveDown(10)
      } else if (key.name === "home") {
        selectRef.current.setSelectedIndex(0)
      } else if (key.name === "end") {
        selectRef.current.setSelectedIndex(entries.length - 1)
      }
    }
  })

  return (
    <box flexDirection="column" padding={1} gap={1}>
      <SearchInput value={searchQuery} focused={focusedElement === "input"} onInput={onSearch} />
      {hasEntries ? (
        <select
          ref={selectRef}
          focused={focusedElement === "list"}
          options={options}
          width="100%"
          height="100%"
          backgroundColor={theme.background}
          focusedBackgroundColor={theme.background}
          textColor={theme.text}
          focusedTextColor={theme.text}
          selectedBackgroundColor={theme.borderSubtle}
          selectedTextColor={theme.text}
          descriptionColor={theme.textMuted}
          selectedDescriptionColor={theme.text}
          showDescription
          showScrollIndicator
          wrapSelection
          onChange={(index) => {
            const threshold = 5
            if (hasMore && !isLoadingMore && index >= entries.length - threshold) {
              onLoadMore()
            }
          }}
          onSelect={(_, option) => {
            if (!option || typeof option.value !== "number") {
              return
            }
            const entry = entriesById.get(option.value)
            if (!entry) {
              return
            }
            void Effect.runPromise(copyToClipboard(entry.id)).catch((copyError: unknown) => {
              const message =
                copyError instanceof Error ? copyError.message : "Failed to copy entry"
              logError(message)
              toast.error(copyError, "Failed to copy entry")
            })
          }}
        />
      ) : (
        <box
          flexGrow={1}
          minHeight={5}
          width="100%"
          height="100%"
          backgroundColor={theme.background}
        >
          <text fg={theme.textMuted}>No results</text>
        </box>
      )}
    </box>
  )
}
