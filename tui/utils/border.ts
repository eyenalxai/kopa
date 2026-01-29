const splitBorderSides = ["left", "right", "top", "bottom"] as const

export const SplitBorder = {
  border: splitBorderSides,
  customBorderChars: {
    topLeft: "┏",
    bottomLeft: "┗",
    vertical: "┃",
    topRight: "┓",
    bottomRight: "┛",
    horizontal: "━",
    bottomT: "┻",
    topT: "┳",
    cross: "╋",
    leftT: "┣",
    rightT: "┫",
  },
}
