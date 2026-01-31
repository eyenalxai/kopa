import { homedir } from "node:os"
import { join } from "node:path"

import { Effect, Schema, Config } from "effect"

export class ConfigFileError extends Schema.TaggedError<ConfigFileError>()("ConfigFileError", {
  message: Schema.String,
  path: Schema.String,
}) {}

export class ConfigParseError extends Schema.TaggedError<ConfigParseError>()("ConfigParseError", {
  message: Schema.String,
  path: Schema.String,
}) {}

const KopaConfigSchema = Schema.Struct({
  historyLimit: Schema.Number.pipe(Schema.int(), Schema.positive()),
  maxFileSizeMb: Schema.Number.pipe(Schema.int(), Schema.positive()),
})

export type KopaConfig = Schema.Schema.Type<typeof KopaConfigSchema>

export class ConfigService extends Effect.Service<ConfigService>()("ConfigService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const configDir = join(homedir(), ".config", "kopa")
    const configPath = join(configDir, "config.json")

    const defaultConfig: KopaConfig = {
      historyLimit: 1000,
      maxFileSizeMb: 10,
    }

    const loadConfigFile = Effect.fn("ConfigService.loadConfigFile")(function* () {
      const file = Bun.file(configPath)
      const exists = yield* Effect.tryPromise({
        try: async () => file.exists(),
        catch: (error) =>
          new ConfigFileError({
            message: `Failed to check config file: ${String(error)}`,
            path: configPath,
          }),
      })

      if (!exists) {
        return defaultConfig
      }

      const content = yield* Effect.tryPromise({
        try: async () => (await file.json()) as unknown,
        catch: (error) =>
          new ConfigParseError({
            message: `Failed to parse config file: ${String(error)}`,
            path: configPath,
          }),
      })

      return yield* Schema.decodeUnknown(KopaConfigSchema)(content).pipe(
        Effect.mapError(
          (error) =>
            new ConfigParseError({
              message: `Invalid config values: ${String(error)}`,
              path: configPath,
            }),
        ),
      )
    })

    const fileConfig = yield* loadConfigFile().pipe(
      Effect.catchTag("ConfigFileError", (err) =>
        Effect.gen(function* () {
          yield* Effect.logWarning("Config file error, using defaults", { error: err.message })
          return defaultConfig
        }),
      ),
      Effect.catchTag("ConfigParseError", (err) =>
        Effect.gen(function* () {
          yield* Effect.logWarning("Config parse error, using defaults", { error: err.message })
          return defaultConfig
        }),
      ),
    )

    const envHistoryLimit = yield* Config.number("KOPA_HISTORY_LIMIT").pipe(
      Config.withDefault(fileConfig.historyLimit),
    )
    const envMaxFileSizeMb = yield* Config.number("KOPA_MAX_FILE_SIZE_MB").pipe(
      Config.withDefault(fileConfig.maxFileSizeMb),
    )

    const finalConfig: KopaConfig = {
      historyLimit: envHistoryLimit,
      maxFileSizeMb: envMaxFileSizeMb,
    }

    return finalConfig
  }),
}) {}
