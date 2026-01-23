import type { TextEntryRow } from "./db"
import { Effect } from "effect"

import { copy } from "./clipboard"
import { formatTimestamp, truncateContent } from "./clipboard-list-utils"
import { useTheme } from "./theme"

type ClipboardListProps = {
  readonly entries: ReadonlyArray<TextEntryRow>
}

export const ClipboardList = ({ entries }: ClipboardListProps) => {
  const theme = useTheme()
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
  const options = entries.map((entry) => ({
    name: truncateContent(entry.content),
    description: formatTimestamp(entry.created_at),
    value: entry.id,
  }))

  return (
    <box flexDirection="column" border borderColor={theme.border} padding={1} gap={1}>
      <select
        focused
        options={options}
        flexGrow={1}
        minHeight={5}
        width="100%"
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
            void Effect.runPromise(Effect.logError(message)).catch(() => {})
          })
        }}
      />
    </box>
  )
}
