import { useKeyboard, useRenderer } from "@opentui/react"
import { Effect } from "effect"
import type { ReactNode } from "react"

import { copy } from "../lib/clipboard"
import { useExit } from "../lib/exit"

type RootBoxProps = {
  readonly children: ReactNode
}

export const RootBox = ({ children }: RootBoxProps) => {
  const renderer = useRenderer()
  const exit = useExit()
  const handleMouseUp = async () => {
    const text = renderer.getSelection()?.getSelectedText()
    if (text && text.length > 0) {
      await copy(text).catch((copyError) => {
        const message = copyError instanceof Error ? copyError.message : "Failed to copy selection"
        void Effect.runPromise(Effect.logError(message)).catch(() => {})
      })
      renderer.clearSelection()
    }
  }

  useKeyboard((event) => {
    if (event.ctrl && event.name === "c") {
      event.preventDefault()
      event.stopPropagation()
      exit()
    }
  })

  return (
    <box
      flexDirection="column"
      alignItems="stretch"
      flexGrow={1}
      padding={1}
      onMouseUp={handleMouseUp}
    >
      {children}
    </box>
  )
}
