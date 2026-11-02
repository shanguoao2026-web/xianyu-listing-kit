export class UserError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 2) {
    super(message);
    this.name = "UserError";
    this.exitCode = exitCode;
  }
}

export function assertNever(value: never): never {
  throw new Error(`内部错误：未处理的值 ${String(value)}`);
}
