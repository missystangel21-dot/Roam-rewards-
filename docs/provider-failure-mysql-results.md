# Provider-Failure MySQL Compatibility Results

## Execution environment

The scenarios ran against the project’s connected MySQL-compatible TiDB serverless engine (`8.0.11-TiDB-v8.5.3-serverless`) using disposable `TEMPORARY` tables. No production tables or user rows were modified. The fixture tables were dropped in the same execution after verification.

| Scenario | Expected invariant | Observed result |
| --- | --- | --- |
| Provider failure before commit | Status, balance, compensation ledger, audit event, and outbox entry return to their initial state. | `UNDER_REVIEW`, balance `0`, and zero compensation/audit/outbox rows. |
| Provider failure after commit | Rejection, one compensation credit, one audit event, and a pending provider outbox remain durable. | `REJECTED`, balance `500`, one compensation row, one audit row, and durable outbox state. |
| Outbox retry | Delivery retry changes only the outbox state and does not duplicate financial or audit records. | Outbox attempts reached `2`; compensation and audit counts remained `1`. |

The disposable transaction script completed successfully. This validates the database engine’s transaction and temporary-table behavior for the modeled provider-failure boundary. It does not replace a full integration harness against the exact production ORM schema and provider adapters.

> The real payout provider remains disabled. The test validates state safety around rejection, compensation, audit, and retry semantics; it does not send money or contact an external provider.
