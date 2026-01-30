import { Effect, Schema } from "effect"

export const decodeBranded = <A, I>(
  schema: Schema.Schema<A, I>,
  value: I,
  errorMessage: string,
): Effect.Effect<A, { message: string }> =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError((error) => ({ message: `${errorMessage}: ${String(error)}` })),
  )
