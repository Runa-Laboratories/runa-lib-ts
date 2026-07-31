# Troubleshooting

- `ConfigError`: check key and endpoint configuration.
- `ApiError` with `malformed_response`: verify the service response contract.
- `TimeoutError`: retry only when the operation is safe for your workflow.
- `AbortError`: the private cancellation seam cancelled the operation.

Do not add credentials, raw responses, command output, or open-handshake
values to diagnostic reports.
