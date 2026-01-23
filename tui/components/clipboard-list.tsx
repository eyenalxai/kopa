import type { TextEntryRow } from "../lib/db"

import { useKeyboard } from "@opentui/react"
import { Searcher } from "fast-fuzzy"
import { useMemo, useState } from "react"

import { copy } from "../lib/clipboard"
import { formatTimestamp, truncateContent } from "../lib/clipboard-list-utils"
import { logError } from "../lib/logger"
import { useTheme } from "../lib/theme"

import { SearchInput } from "./search-input"

type ClipboardListProps = {
  readonly entries: ReadonlyArray<TextEntryRow>
}

export const ClipboardList = ({ entries }: ClipboardListProps) => {
  const theme = useTheme()
  const [searchQuery, setSearchQuery] = useState("")
  const [focusedElement, setFocusedElement] = useState<"input" | "list">("input")
  const searcher = useMemo(
    () =>
      new Searcher(Array.from(entries), {
        keySelector: (entry) => entry.content,
      }),
    [entries],
  )
  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) {
      return entries
    }
    return searcher.search(query)
  }, [entries, searchQuery, searcher])
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
  const options = filteredEntries.map((entry) => ({
    name: truncateContent(entry.content),
    description: formatTimestamp(entry.created_at),
    value: entry.id,
  }))

  useKeyboard((key) => {
    if (key.name === "tab") {
      setFocusedElement((prev) => (prev === "input" ? "list" : "input"))
    } else if (key.name === "escape") {
      if (searchQuery) {
        setSearchQuery("")
      }
      setFocusedElement("list")
    }
  })

  return (
    <box flexDirection="column" border borderColor={theme.border} padding={1} gap={1}>
      <SearchInput
        value={searchQuery}
        focused={focusedElement === "input"}
        onInput={setSearchQuery}
      />
      <select
        focused={focusedElement === "list"}
        options={options}
        flexGrow={1}
        minHeight={5}
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
        onSelect={(_, option) => {
          if (!option || typeof option.value !== "number") {
            return
          }
          const entry = entriesById.get(option.value)
          if (!entry) {
            return
          }
          void copy(entry.content).catch((copyError) => {
            const message = copyError instanceof Error ? copyError.message : "Failed to copy entry"
            logError(message)
          })
        }}
      />
    </box>
  )
}
