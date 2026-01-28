import { useTheme } from "../providers/theme"

type SearchInputProps = {
  readonly value: string
  readonly onInput: (value: string) => void
  readonly focused: boolean
}

export const SearchInput = ({ value, onInput, focused }: SearchInputProps) => {
  const theme = useTheme()

  return (
    <box border borderColor={focused ? theme.primary : theme.borderSubtle} padding={1}>
      <input placeholder="Search clipboard..." value={value} focused={focused} onInput={onInput} />
    </box>
  )
}
