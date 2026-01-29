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
