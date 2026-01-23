import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { App } from "./tui/app"

const cli = yargs(hideBin(process.argv))
  .scriptName("kopa")
  .usage("kopa [--daemon]")
  .help("help", "show help")
  .alias("help", "h")
  .option("daemon", {
    describe: "run a long-lived background task",
    type: "boolean",
    default: false,
  })
  .fail((msg, err) => {
    if (msg?.startsWith("Unknown argument")) {
      if (err) throw err
      cli.showHelp("log")
      process.exit(1)
    }
    if (err) throw err
    process.exit(1)
  })
  .strict()

const args = await cli.parse()

if (args.daemon) {
  const counter = { value: 0 }
  setInterval(() => {
    counter.value += 1
    console.log(`daemon tick ${counter.value}`)
  }, 1000)
} else {
  const renderer = await createCliRenderer()
  createRoot(renderer).render(<App />)
}
