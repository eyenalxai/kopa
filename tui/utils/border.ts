const splitBorderSides: ("left" | "right" | "top" | "bottom")[] = ["left", "right", "top", "bottom"]

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
