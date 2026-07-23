export type GeneratorErrorCode =
  | "ANCESTOR_CHANGED"
  | "ARGUMENTS_INVALID"
  | "NAME_INVALID"
  | "PATH_UNSAFE"
  | "PLAN_INVALID"
  | "ROLLBACK_UNSAFE"
  | "SYMLINK_UNSAFE"
  | "TARGET_COLLISION"
  | "TARGET_INVALID"
  | "VERIFICATION_FAILED"

export class GeneratorError extends Error {
  readonly code: GeneratorErrorCode

  constructor(code: GeneratorErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "GeneratorError"
    this.code = code
  }
}
