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
  override readonly message = "Runa SDK configuration is invalid.";

  constructor() {
    super("Runa SDK configuration is invalid.");
    Object.setPrototypeOf(this, new.target.prototype);
    this.stack = `${this.name}: ${this.message}`;
  }
}

export class ApiError extends RunaError {
  override readonly name = "ApiError";
  readonly code: "api_error" | "malformed_response";
  readonly status: number;
  override readonly message:
    | "The Runa API request failed."
    | "The Runa API returned an invalid response.";

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

export class CommandError extends RunaError {
  override readonly name = "CommandError";
  readonly code = "command_error";
  override readonly message = "The session command failed.";

  private constructor() {
    super("The session command failed.");
    Object.setPrototypeOf(this, new.target.prototype);
    throw new TypeError("CommandError cannot be constructed directly.");
  }
}
