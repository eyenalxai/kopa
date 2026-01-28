import { Effect } from "effect"

export const copy = async (text: string): Promise<void> => {
  if (!process.stdout.isTTY) {
    return
  }

  const base64 = Buffer.from(text).toString("base64")
  const osc52 = `\x1b]52;c;${base64}\x07`
  const passthrough = process.env["TMUX"] || process.env["STY"]
  const sequence = passthrough ? `\x1bPtmux;\x1b${osc52}\x1b\\` : osc52
  process.stdout.write(sequence)

  if (!process.env["WAYLAND_DISPLAY"]) {
    throw new Error("WAYLAND_DISPLAY is not set")
  }

  const wlCopyPath = Bun.which("wl-copy")
  if (!wlCopyPath) {
    throw new Error("wl-copy is not available")
  }

  const proc = Bun.spawn([wlCopyPath], {
    stdin: "pipe",
    stdout: "ignore",
    stderr: "ignore",
  })
  await proc.stdin.write(text)
  await proc.stdin.end()
  const exitCode = await Effect.runPromise(
    Effect.tryPromise({
      try: () => proc.exited,
      catch: (error) => new Error(typeof error === "string" ? error : "wl-copy failed"),
    }),
  )
  if (exitCode !== 0) {
    throw new Error("wl-copy failed")
  }
}
