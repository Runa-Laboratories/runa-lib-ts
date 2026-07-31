/**
 * Base class for normalized public Runa SDK errors.
 * @runa-contract runaerror-summary PRD-024#R-024-01
 */
export abstract class RunaError extends Error {
  /** Stable public error class name. */
  abstract override readonly name:
    | "ConfigError"
    | "ApiError"
    | "CommandError";
  /** Stable normalized public error code. */
  abstract readonly code:
    | "config_error"
    | "api_error"
    | "malformed_response"
    | "command_error";
}

/**
 * Safe public error raised when selected client configuration is invalid.
 * @runa-contract configerror-summary PRD-024#R-024-01
 */
export class ConfigError extends RunaError {
  /** Stable public error class name. */
  override readonly name = "ConfigError";
  /** Stable normalized configuration error code. */
  readonly code = "config_error";
  /** Fixed safe English public error message. */
  override readonly message = "Runa SDK configuration is invalid.";

  /**
   * Constructs a safe configuration error.
   * @returns A safe configuration error instance.
   * @runa-contract configerror-constructor-description PRD-024#R-024-01
   * @runa-contract configerror-constructor-returns PRD-024#R-024-01
   */
  constructor() {
    super("Runa SDK configuration is invalid.");
    Object.setPrototypeOf(this, new.target.prototype);
    this.stack = `${this.name}: ${this.message}`;
  }
}

/**
 * Safe public error for an API failure or malformed successful response.
 * @runa-contract apierror-summary PRD-024#R-024-01
 */
export class ApiError extends RunaError {
  /** Stable public error class name. */
  override readonly name = "ApiError";
  /** Stable normalized API or malformed-response code. */
  readonly code: "api_error" | "malformed_response";
  /** HTTP status associated with the API outcome. */
  readonly status: number;
  /** Fixed safe English public error message. */
  override readonly message:
    | "The Runa API request failed."
    | "The Runa API returned an invalid response.";

  /**
   * Constructs a safe API error.
   * @param status HTTP status associated with the API outcome.
   * @param code Normalized API failure or malformed-response code.
   * @returns A safe API error instance.
   * @runa-contract apierror-constructor-description PRD-024#R-024-01
   * @runa-contract apierror-constructor-param-status PRD-024#R-024-03
   * @runa-contract apierror-constructor-param-code PRD-024#R-024-03
   * @runa-contract apierror-constructor-returns PRD-024#R-024-01
   */
  constructor(
    status: number,
    code: "api_error" | "malformed_response" = "api_error",
  ) {
    const message =
      code === "malformed_response"
        ? "The Runa API returned an invalid response."
        : "The Runa API request failed.";
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.status = Number.isInteger(status) ? status : 0;
    this.code = code;
    this.message = message;
    this.stack = `${this.name}: ${this.message}`;
  }
}

/**
 * Reserved non-constructible public command-error type.
 * @runa-contract commanderror-summary PRD-024#R-024-01
 */
export class CommandError extends RunaError {
  /** Stable public error class name. */
  override readonly name = "CommandError";
  /** Stable normalized command error code. */
  readonly code = "command_error";
  /** Fixed safe English public error message. */
  override readonly message = "The session command failed.";

  private constructor() {
    super("The session command failed.");
    Object.setPrototypeOf(this, new.target.prototype);
    throw new TypeError("CommandError cannot be constructed directly.");
  }
}
