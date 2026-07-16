# Forkpoint normalized trace schema

Forkpoint accepts one input format: a JSON object with repository metadata, a
chronological list of observable events, and a final outcome.

```json
{
  "traceId": "demo-next-router",
  "task": "Add a settings page to this application",
  "repository": {
    "name": "demo-app",
    "path": "./demo/demo-app"
  },
  "events": [
    {
      "id": "event-1",
      "timestamp": "2026-07-16T10:00:00Z",
      "type": "user_request",
      "content": "Add a settings page to this application"
    },
    {
      "id": "event-2",
      "timestamp": "2026-07-16T10:00:04Z",
      "type": "assumption",
      "content": "This project uses React Router",
      "evidence": []
    }
  ],
  "finalOutcome": {
    "status": "failed",
    "summary": "Build failed because the routing structure was incorrect"
  }
}
```

Supported event types:

- `user_request`
- `assumption`
- `reasoning_summary`
- `tool_call`
- `tool_result`
- `file_read`
- `file_edit`
- `observation`
- `test_result`
- `final_result`

Every event requires a unique `id`, an ISO 8601 `timestamp`, and a supported
`type`. Events may carry `content`, `title`, `path`, `contentSummary`,
`evidence`, `command`, or `status` fields. Evidence entries must reference
event IDs in the same trace. Uploads are limited to 300 KB and 250 events.

Forkpoint analyzes explicit events and observable actions. It does not request,
store, or expose private chain-of-thought.
