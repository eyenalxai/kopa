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

import { useTheme } from "./theme"

type ToastVariant = "info" | "success" | "warning" | "error"

export type ToastOptions = {
  title?: string
  message: string
  variant?: ToastVariant
  duration?: number
}

export type ToastState = {
  title?: string
  message: string
  variant: ToastVariant
}

type ToastContextValue = {
  show: (options: ToastOptions) => void
  error: (err: unknown, title?: string) => void
  dismiss: () => void
  currentToast: ToastState | null
}

const ToastContext = createContext<ToastContextValue | null>(null)

const defaultDurationMs = 5000

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
    (err: unknown, title?: string) => {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "An unknown error has occurred"
      show({ variant: "error", title, message })
    },
    [show],
  )

  const dismiss = useCallback(() => {
    clearTimer()
    setCurrentToast(null)
  }, [clearTimer])

  const value = useMemo<ToastContextValue>(
    () => ({ show, error, dismiss, currentToast }),
    [show, error, dismiss, currentToast],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export const useToast = () => {
  const value = useContext(ToastContext)
  if (!value) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return value
}

export const resolveVariantColor = (variant: ToastVariant, theme: ReturnType<typeof useTheme>) => {
  switch (variant) {
    case "success":
      return theme.success
    case "warning":
      return theme.warning
    case "error":
      return theme.error
    case "info":
      return theme.primary
  }
}
