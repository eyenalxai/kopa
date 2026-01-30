import { createHash } from "node:crypto"

export const computeHash = (data: Uint8Array): string => {
  return createHash("sha256").update(data).digest("hex")
}
