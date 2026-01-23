import { useRenderer } from "@opentui/react"
import { createContext, useContext, type ReactNode } from "react"

type ExitFn = () => void

const ExitContext = createContext<ExitFn | null>(null)

export const useExit = () => {
  const exit = useContext(ExitContext)
  if (!exit) {
    throw new Error("useExit must be used within ExitProvider")
  }
  return exit
}

type ExitProviderProps = {
  readonly children: ReactNode
}

export const ExitProvider = ({ children }: ExitProviderProps) => {
  const renderer = useRenderer()
  const exit = () => {
    renderer.destroy()
    process.exit(0)
  }

  return <ExitContext.Provider value={exit}>{children}</ExitContext.Provider>
}
