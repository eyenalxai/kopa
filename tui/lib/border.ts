export const EmptyBorder = {
  topLeft: "",
  bottomLeft: "",
  vertical: "",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
}

type BorderSide = "left" | "right"

type FullBorderSide = BorderSide | "top" | "bottom"

const splitBorderSides: FullBorderSide[] = ["left", "right", "top", "bottom"]

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
