import { MouseEvent, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useCallback } from "react"

import { useTheme } from "../providers/theme"
import { resolveVariantColor, useToast } from "../providers/toast"
import { SplitBorder } from "../utils/border"

export const Toast = () => {
  const { currentToast, dismiss } = useToast()
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      if (event.button === 2) {
        dismiss()
      }
    },
    [dismiss],
  )

  if (!currentToast) {
    return null
  }

  const maxWidth = Math.min(60, Math.max(0, dimensions.width - 6))
  const borderColor = resolveVariantColor(currentToast.variant, theme)

  return (
    <box
      position="absolute"
      zIndex={1000}
      justifyContent="center"
      alignItems="flex-start"
      top={2}
      right={2}
      maxWidth={maxWidth}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor={theme.background}
      borderColor={borderColor}
      border={SplitBorder.border}
      customBorderChars={SplitBorder.customBorderChars}
      onMouseDown={handleMouseDown}
    >
      {currentToast.title !== null &&
      currentToast.title !== undefined &&
      currentToast.title !== "" ? (
        <text attributes={TextAttributes.BOLD} marginBottom={1} fg={theme.text}>
          {currentToast.title}
        </text>
      ) : null}
      <text fg={theme.text} wrapMode="word" width="100%">
        {currentToast.message}
      </text>
    </box>
  )
}
