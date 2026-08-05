// @generated {"contract_id":"runa-sdk-contract","generator_path":"tools/runa-contract-generator.mjs","generator_sha256":"75de6242dde7fccfc9251d371020c5dc5ffb96a65399647b6d54d2c8850202e1","generator_version":"0.2.0","snapshot_path":"runa-sdk-contract.snapshot.json","snapshot_sha256":"497ad3bfd712d7ed0c55289e94808435a924fd5cc909f1ab0620f860a6ebfc98","snapshot_version":"1.3.0"}
export const GENERATED_OPERATIONS = {
  "me.get": {
    "hasRequestBody": false,
    "method": "GET",
    "operationKey": "me.get",
    "pathParameters": [],
    "pathTemplate": "/v1/me",
    "successStatus": 200
  },
  "records.list": {
    "hasRequestBody": false,
    "method": "GET",
    "operationKey": "records.list",
    "pathParameters": [],
    "pathTemplate": "/v1/records",
    "successStatus": 200
  },
  "sessions.agentAuth": {
    "hasRequestBody": false,
    "method": "GET",
    "operationKey": "sessions.agentAuth",
    "pathParameters": [
      "id"
    ],
    "pathTemplate": "/v1/sessions/:id/agent-auth",
    "successStatus": 200
  },
  "sessions.checkpoint": {
    "hasRequestBody": true,
    "method": "POST",
    "operationKey": "sessions.checkpoint",
    "pathParameters": [
      "id"
    ],
    "pathTemplate": "/v1/sessions/:id/checkpoint",
    "successStatus": 200
  },
  "sessions.create": {
    "hasRequestBody": true,
    "method": "POST",
    "operationKey": "sessions.create",
    "pathParameters": [],
    "pathTemplate": "/v1/sessions",
    "successStatus": 201
  },
  "sessions.delete": {
    "hasRequestBody": false,
    "method": "DELETE",
    "operationKey": "sessions.delete",
    "pathParameters": [
      "id"
    ],
    "pathTemplate": "/v1/sessions/:id",
    "successStatus": 200
  },
  "sessions.exec": {
    "hasRequestBody": true,
    "method": "POST",
    "operationKey": "sessions.exec",
    "pathParameters": [
      "id"
    ],
    "pathTemplate": "/v1/sessions/:id/exec",
    "successStatus": 200
  },
  "sessions.get": {
    "hasRequestBody": false,
    "method": "GET",
    "operationKey": "sessions.get",
    "pathParameters": [
      "id"
    ],
    "pathTemplate": "/v1/sessions/:id",
    "successStatus": 200
  },
  "sessions.list": {
    "hasRequestBody": false,
    "method": "GET",
    "operationKey": "sessions.list",
    "pathParameters": [],
    "pathTemplate": "/v1/sessions",
    "successStatus": 200
  },
  "sessions.open": {
    "hasRequestBody": false,
    "method": "POST",
    "operationKey": "sessions.open",
    "pathParameters": [
      "id"
    ],
    "pathTemplate": "/v1/sessions/:id/open",
    "successStatus": 200
  },
  "sessions.pause": {
    "hasRequestBody": false,
    "method": "POST",
    "operationKey": "sessions.pause",
    "pathParameters": [
      "id"
    ],
    "pathTemplate": "/v1/sessions/:id/pause",
    "successStatus": 200
  },
  "sessions.resume": {
    "hasRequestBody": false,
    "method": "POST",
    "operationKey": "sessions.resume",
    "pathParameters": [
      "id"
    ],
    "pathTemplate": "/v1/sessions/:id/resume",
    "successStatus": 200
  },
  "sessions.start": {
    "hasRequestBody": false,
    "method": "POST",
    "operationKey": "sessions.start",
    "pathParameters": [
      "id"
    ],
    "pathTemplate": "/v1/sessions/:id/start",
    "successStatus": 200
  },
  "sessions.stop": {
    "hasRequestBody": false,
    "method": "POST",
    "operationKey": "sessions.stop",
    "pathParameters": [
      "id"
    ],
    "pathTemplate": "/v1/sessions/:id/stop",
    "successStatus": 200
  }
} as const;
