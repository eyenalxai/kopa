import { createTextAttributes } from "@opentui/core"
import { useState } from "react"

import { useTheme } from "./theme"

type ContentErrorProps = {
  readonly children: string
  readonly title?: string
  readonly expand?: boolean
  readonly maxLines?: number
}

export const ContentError = ({ children, title, expand, maxLines = 7 }: ContentErrorProps) => {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const isExpanded = expand === true || expanded
  const safeMaxLines = Math.max(1, maxLines)
  const lines = children.split("\n")
  const isTruncated = !isExpanded && lines.length > safeMaxLines
  const visibleText = isTruncated ? lines.slice(0, safeMaxLines).join("\n") : children

  return (
    <box flexDirection="column" gap={1} border borderColor={theme.error} padding={1}>
      {title && (
        <box>
          <text fg={theme.error} wrapMode="word" attributes={createTextAttributes({ bold: true })}>
            {title}
          </text>
        </box>
      )}
      <box>
        <text fg={theme.error} wrapMode="word">
          {visibleText}
        </text>
      </box>
      {!expand && lines.length > safeMaxLines && (
        <box onMouseUp={() => setExpanded((value) => !value)}>
          <text fg={theme.primary}>{isExpanded ? "[Show less]" : "[Show more]"}</text>
        </box>
      )}
    </box>
  )
}
