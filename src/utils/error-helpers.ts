export const hasErrorCode = (value: unknown): value is { code?: unknown } =>
  typeof value === "object" && value !== null && "code" in value

export const getErrorCode = (error: unknown): string | null => {
  if (hasErrorCode(error)) {
    return typeof error.code === "string" ? error.code : null
  }
  return null
}
