const UTF8_ENCODER = new TextEncoder()
const OPERATOR_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/u

export const MAX_OPERATOR_REQUEST_BYTES = 1_024

export const hasOperatorControlCharacters = (value: string): boolean => {
  return OPERATOR_CONTROL_CHARACTER_PATTERN.test(value.trim())
}

export const trimmedUtf8ByteLength = (value: string): number => {
  return UTF8_ENCODER.encode(value.trim()).byteLength
}
