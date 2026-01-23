import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { SplitBorder } from "../lib/border"
import { useTheme } from "../lib/theme"

type ToastVariant = "info" | "success" | "warning" | "error"

export type ToastOptions = {
  title?: string
  message: string
  variant?: ToastVariant
  duration?: number
}

type ToastState = {
  title?: string
  message: string
  variant: ToastVariant
}

type ToastContextValue = {
  show: (options: ToastOptions) => void
  error: (err: unknown) => void
  currentToast: ToastState | null
}

const ToastContext = createContext<ToastContextValue | null>(null)

const defaultDurationMs = 5000

const resolveVariantColor = (variant: ToastVariant, theme: ReturnType<typeof useTheme>) => {
  switch (variant) {
    case "success":
      return theme.success
    case "warning":
      return theme.warning
    case "error":
      return theme.error
    case "info":
    default:
      return theme.primary
  }
}

const normalizeToastOptions = (options: ToastOptions) => {
  const variant = options.variant ?? "info"
  const duration = options.duration ?? defaultDurationMs
  return {
    toast: {
      title: options.title,
      message: options.message,
      variant,
    },
    duration,
  }
}

export const ToastProvider = ({ children }: { readonly children: ReactNode }) => {
  const [currentToast, setCurrentToast] = useState<ToastState | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimer(), [])

  const show = useCallback(
    (options: ToastOptions) => {
    const { toast, duration } = normalizeToastOptions(options)
    setCurrentToast(toast)
    clearTimer()
    if (duration > 0) {
      timeoutRef.current = setTimeout(() => {
        setCurrentToast(null)
        timeoutRef.current = null
      }, duration)
    }
    },
    [clearTimer],
  )

  const error = useCallback(
    (err: unknown) => {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "An unknown error has occurred"
    show({ variant: "error", message })
    },
    [show],
  )

  const value = useMemo<ToastContextValue>(() => ({ show, error, currentToast }), [show, error, currentToast])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export const useToast = () => {
  const value = useContext(ToastContext)
  if (!value) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return value
}

export const Toast = () => {
  const { currentToast } = useToast()
  const theme = useTheme()
  const dimensions = useTerminalDimensions()

  if (!currentToast) {
    return null
  }

  const maxWidth = Math.min(60, Math.max(0, dimensions.width - 6))
  const borderColor = resolveVariantColor(currentToast.variant, theme)

  return (
    <box
      position="absolute"
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
    >
      {currentToast.title ? (
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
