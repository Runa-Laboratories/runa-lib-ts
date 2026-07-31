export abstract class RunaError extends Error {
  abstract override readonly name:
    | "ConfigError"
    | "ApiError"
    | "CommandError";
  abstract readonly code:
    | "config_error"
    | "api_error"
    | "malformed_response"
    | "command_error";
}

export class ConfigError extends RunaError {
  override readonly name = "ConfigError";
  readonly code = "config_error";
  override readonly message = "The Runa SDK configuration is invalid.";

  constructor() {
    super("The Runa SDK configuration is invalid.");
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ApiError extends RunaError {
  override readonly name = "ApiError";
  readonly code: "api_error" | "malformed_response";
  readonly status: number;
  override readonly message: "The Runa API request failed.";

  constructor(
    status: number,
    code: "api_error" | "malformed_response" = "api_error",
  ) {
    super("The Runa API request failed.");
    Object.setPrototypeOf(this, new.target.prototype);
    this.status = Number.isInteger(status) ? status : 0;
    this.code = code;
    this.message = "The Runa API request failed.";
  }
}

export class CommandError extends RunaError {
  override readonly name = "CommandError";
  readonly code = "command_error";
  override readonly message = "The session command failed.";

  private constructor() {
    super("The session command failed.");
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
