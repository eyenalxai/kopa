export const truncateContent = (content: string, maxLength = 80) => {
  const singleLine = content.replace(/\s+/g, " ").trim()
  if (singleLine.length <= maxLength) {
    return singleLine
  }
  if (maxLength <= 3) {
    return singleLine.slice(0, maxLength)
  }
  return `${singleLine.slice(0, maxLength - 3)}...`
}

export const formatTimestamp = (createdAt: number) => {
  const timestampMs = createdAt < 1_000_000_000_000 ? createdAt * 1000 : createdAt
  const diffMs = Math.max(0, Date.now() - timestampMs)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return "just now"
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`
  return new Date(timestampMs).toISOString().slice(0, 10)
}
