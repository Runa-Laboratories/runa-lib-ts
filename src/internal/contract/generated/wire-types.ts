// @generated {"contract_id":"runa-sdk-contract","generator_path":"tools/runa-contract-generator.mjs","generator_sha256":"75de6242dde7fccfc9251d371020c5dc5ffb96a65399647b6d54d2c8850202e1","generator_version":"0.2.0","snapshot_path":"runa-sdk-contract.snapshot.json","snapshot_sha256":"d5e78a8913b059a7e0ee7a2e119c4c2c882768378ceb57a216e43b5f564c2954","snapshot_version":"1.0.0"}
export type GeneratedWireValue = null | boolean | number | string | GeneratedWireValue[] | { readonly [key: string]: GeneratedWireValue };
export const GENERATED_WIRE_SCHEMAS = {
  "CheckpointRequest": {
    "additionalProperties": false,
    "properties": {
      "name": {
        "maxLength": 80,
        "minLength": 1,
        "type": "string"
      }
    },
    "required": [
      "name"
    ],
    "type": "object"
  },
  "Error": {
    "additionalProperties": false,
    "properties": {
      "error": {
        "type": "string"
      }
    },
    "required": [
      "error"
    ],
    "type": "object"
  },
  "ExecRequest": {
    "additionalProperties": false,
    "properties": {
      "args": {
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      "command": {
        "minLength": 1,
        "type": "string"
      },
      "cwd": {
        "type": "string"
      },
      "timeout_secs": {
        "maximum": 600,
        "minimum": 1,
        "type": "integer"
      }
    },
    "required": [
      "command"
    ],
    "type": "object"
  },
  "ExecResult": {
    "additionalProperties": false,
    "properties": {
      "duration_ms": {
        "minimum": 0,
        "type": "integer"
      },
      "exit_code": {
        "type": "integer"
      },
      "stderr": {
        "type": "string"
      },
      "stderr_truncated": {
        "type": "boolean"
      },
      "stdout": {
        "type": "string"
      },
      "stdout_truncated": {
        "type": "boolean"
      }
    },
    "required": [
      "exit_code",
      "stdout",
      "stderr",
      "duration_ms",
      "stdout_truncated",
      "stderr_truncated"
    ],
    "type": "object"
  },
  "Me": {
    "additionalProperties": false,
    "properties": {
      "email": {
        "type": "string"
      },
      "id": {
        "$ref": "#/components/schemas/Uuid"
      },
      "workspace": {
        "oneOf": [
          {
            "additionalProperties": false,
            "properties": {
              "assigned": {
                "const": true
              },
              "usage": {
                "properties": {
                  "est_remaining_usd": {
                    "type": "number"
                  },
                  "est_spend_usd": {
                    "type": "number"
                  },
                  "note": {
                    "type": "string"
                  }
                },
                "required": [
                  "est_spend_usd",
                  "est_remaining_usd",
                  "note"
                ],
                "type": "object"
              }
            },
            "required": [
              "assigned",
              "usage"
            ],
            "type": "object"
          },
          {
            "additionalProperties": false,
            "properties": {
              "assigned": {
                "const": false
              },
              "waitlist_position": {
                "minimum": 0,
                "type": "integer"
              }
            },
            "required": [
              "assigned",
              "waitlist_position"
            ],
            "type": "object"
          }
        ]
      }
    },
    "required": [
      "id",
      "email",
      "workspace"
    ],
    "type": "object"
  },
  "Ok": {
    "additionalProperties": false,
    "properties": {
      "ok": {
        "const": true
      }
    },
    "required": [
      "ok"
    ],
    "type": "object"
  },
  "OpenResult": {
    "additionalProperties": false,
    "properties": {
      "url": {
        "pattern": "^https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.runacode\\.cloud/__runa/auth\\?t=[^&#]+$",
        "type": "string"
      }
    },
    "required": [
      "url"
    ],
    "type": "object"
  },
  "Record": {
    "additionalProperties": false,
    "properties": {
      "created_at": {
        "format": "date-time",
        "type": "string"
      },
      "detail": {},
      "id": {
        "$ref": "#/components/schemas/Uuid"
      },
      "kind": {
        "type": "string"
      },
      "session_id": {
        "$ref": "#/components/schemas/Uuid"
      },
      "summary": {
        "type": "string"
      }
    },
    "required": [
      "id",
      "session_id",
      "kind",
      "summary",
      "detail",
      "created_at"
    ],
    "type": "object"
  },
  "RuntimeUrl": {
    "pattern": "^https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.runacode\\.cloud$",
    "type": "string"
  },
  "SdkCreateSession": {
    "additionalProperties": false,
    "properties": {
      "agent": {
        "enum": [
          "claude-code",
          "codex",
          "openclaw"
        ]
      },
      "allowed_hosts": {
        "items": {
          "minLength": 1,
          "type": "string"
        },
        "maxItems": 128,
        "type": "array"
      },
      "memory_mib": {
        "maximum": 16384,
        "minimum": 512,
        "type": "integer"
      },
      "name": {
        "maxLength": 80,
        "minLength": 1,
        "type": "string"
      },
      "runtime_port": {
        "maximum": 65535,
        "minimum": 1,
        "type": "integer"
      },
      "vcpus": {
        "maximum": 8,
        "minimum": 1,
        "type": "integer"
      }
    },
    "required": [
      "name"
    ],
    "type": "object"
  },
  "Session": {
    "additionalProperties": false,
    "properties": {
      "agent": {
        "enum": [
          "claude-code",
          "codex",
          "openclaw"
        ]
      },
      "created_at": {
        "format": "date-time",
        "type": "string"
      },
      "id": {
        "$ref": "#/components/schemas/Uuid"
      },
      "memory_mib": {
        "minimum": 0,
        "type": "integer"
      },
      "name": {
        "type": "string"
      },
      "running_seconds": {
        "minimum": 0,
        "type": "integer"
      },
      "slug": {
        "pattern": "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$",
        "type": "string"
      },
      "status": {
        "enum": [
          "creating",
          "running",
          "paused",
          "suspended",
          "stopped",
          "deleted",
          "error"
        ]
      },
      "updated_at": {
        "format": "date-time",
        "type": "string"
      },
      "url": {
        "$ref": "#/components/schemas/RuntimeUrl"
      },
      "user_id": {
        "$ref": "#/components/schemas/Uuid"
      },
      "vcpus": {
        "minimum": 0,
        "type": "integer"
      }
    },
    "required": [
      "id",
      "user_id",
      "slug",
      "name",
      "vcpus",
      "memory_mib",
      "status",
      "running_seconds",
      "created_at",
      "updated_at",
      "url"
    ],
    "type": "object"
  },
  "Uuid": {
    "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    "type": "string"
  }
} as const;
