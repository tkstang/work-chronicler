import chalk from 'chalk';

/**
 * Options for {@link CliError}
 */
export interface CliErrorOptions {
  /** Process exit code (default: 1) */
  exitCode?: number;
  /** Follow-up guidance printed to stdout after the error */
  hint?: string;
  /** Underlying error, kept for debugging */
  cause?: unknown;
}

/**
 * An expected failure at the CLI boundary.
 *
 * Commands throw it instead of printing and calling `process.exit`. The
 * central handler prints `message` to stderr exactly as given (callers style
 * it with chalk), prints `hint` to stdout, and exits with `exitCode`.
 */
export class CliError extends Error {
  override readonly name = 'CliError';
  readonly exitCode: number;
  readonly hint?: string;

  constructor(message: string, options: CliErrorOptions = {}) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.exitCode = options.exitCode ?? 1;
    this.hint = options.hint;
  }
}

/**
 * Check whether a value is a {@link CliError}
 *
 * @param error - Any caught value
 */
export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}

/**
 * Convert a caught value into a {@link CliError} with a command's error prefix.
 *
 * A {@link CliError} passes through unchanged, so validation errors thrown
 * inside a command's `try` keep their own message.
 *
 * @param error - Any caught value
 * @param prefix - Text printed before the error message (e.g. `chalk.red('Error:')`)
 * @param fallback - Message used when the value is not an `Error` (default: `String(error)`)
 */
export function toCliError(
  error: unknown,
  prefix: string,
  fallback?: string,
): CliError {
  if (isCliError(error)) return error;
  const detail =
    error instanceof Error ? error.message : (fallback ?? String(error));
  return new CliError(`${prefix} ${detail}`, { cause: error });
}

/**
 * Where the handler writes. Defaults to the console.
 */
export interface CliErrorOutput {
  error: (text: string) => void;
  log: (text: string) => void;
}

const consoleOutput: CliErrorOutput = {
  error: (text) => console.error(text),
  log: (text) => console.log(text),
};

/**
 * Print a failure and return the exit code for it.
 *
 * A {@link CliError} prints its message and hint and maps to its exit code.
 * Anything else prints `Error: <message>` and maps to exit code 1.
 *
 * @param error - Any value thrown out of the CLI
 * @param output - Output sink (default: console)
 * @returns The process exit code
 */
export function handleCliError(
  error: unknown,
  output: CliErrorOutput = consoleOutput,
): number {
  if (isCliError(error)) {
    output.error(error.message);
    if (error.hint !== undefined) output.log(error.hint);
    return error.exitCode;
  }

  const message = error instanceof Error ? error.message : String(error);
  output.error(`${chalk.red('Error:')} ${message}`);
  return 1;
}
