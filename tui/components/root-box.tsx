import { useKeyboard, useRenderer } from "@opentui/react"
import { Effect } from "effect"
import type { ReactNode } from "react"

import { useExit } from "../providers/exit"
import { copyToClipboard } from "../services/daemon"
import { logError } from "../services/logger"

type RootBoxProps = {
  readonly children: ReactNode
}

export const RootBox = ({ children }: RootBoxProps) => {
  const renderer = useRenderer()
  const exit = useExit()
  const handleMouseUp = () => {
    const text = renderer.getSelection()?.getSelectedText()
    if (text && text.length > 0) {
      Effect.runPromise(copyToClipboard(text)).catch((copyError: unknown) => {
        const message = copyError instanceof Error ? copyError.message : "Failed to copy selection"
        logError(message)
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
    <box margin={0} padding={0} onMouseUp={handleMouseUp}>
      {children}
    </box>
  )
}
