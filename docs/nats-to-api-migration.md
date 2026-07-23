# NATS to REST API Migration: Config-Notify Cache Update

## Background

The `ConfigNotifyService` previously listened on a NATS JetStream consumer (`dems.notify`) to receive notifications when a config record changed. On each message, it fetched the config from the database and refreshed the Redis cache entry.

This approach had a hidden coupling: the `event-monitoring-service` had to be connected to NATS as a consumer solely for this one responsibility, and the upstream publisher had to know which stream to target.

## What Changed

The NATS-based cache update has been replaced with a REST API endpoint. The frontend (or any authorized caller) now explicitly triggers a cache refresh by calling the new endpoint with the config ID and the desired publishing status.

### Removed

- `NatsService` dependency from `ConfigNotifyService`
- `handleNatsMessage` private method
- `normalizeNatsMessage` static helper method
- `consumerStream` config property
- NATS consumer registration in `onModuleInit`
- `NatsModule` import from `ConfigNotifyModule`

### Added

| File                                            | Purpose                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `src/enums/publishingStatus.enum.ts`            | Enum constraining valid `publishing_status` values (`active`, `inactive`) |
| `src/config-notify/update-cache.dto.ts`         | Request body DTO with `class-validator` enforcement                       |
| `src/config-notify/config-notify.controller.ts` | New controller exposing the `PATCH /config-notify/:id` endpoint           |
| `ConfigNotifyService.updateCache()`             | New public method encapsulating the DB query + cache write                |

### What stayed the same

- On startup, `onModuleInit` still preloads all `active` configs into Redis.
- `setCache()` is unchanged — it writes the full config object (schema, mapping, functions, related_transaction, publishing_status) to Redis under the `endpointPath` key.

## New API

### `PATCH /config-notify/:id`

Updates the Redis cache entry for a specific config record.

**Auth:** Requires a valid JWT with the `dems:write` claim (`TazamaAuthGuard`).

**Path param:**

| Param | Type    | Description                            |
| ----- | ------- | -------------------------------------- |
| `id`  | integer | Primary key of the `tcs_config` record |

**Request body:**

```json
{
  "publishing_status": "active"
}
```

| Field               | Type   | Allowed values             |
| ------------------- | ------ | -------------------------- |
| `publishing_status` | string | `"active"` or `"inactive"` |

Any other value returns `400 Bad Request` with a descriptive message.

**Success response — `200 OK`:**

```json
{
  "message": "Cache updated successfully for config ID: 1"
}
```

**Error responses:**

| Status             | Reason                                                                               |
| ------------------ | ------------------------------------------------------------------------------------ |
| `400 Bad Request`  | `id` is not a valid integer, or `publishing_status` is not `"active"` / `"inactive"` |
| `401 Unauthorized` | Missing or invalid JWT                                                               |
| `403 Forbidden`    | JWT is valid but lacks the `dems:write` claim                                        |
| `404 Not Found`    | No `tcs_config` record exists for the given `id`                                     |

## How the cache update works

1. Controller receives `id` (path param) and `publishing_status` (body).
2. `ConfigNotifyService.updateCache()` queries `tcs_config` for all fields by `id`.
3. The `publishing_status` on the fetched record is overridden with the value from the request.
4. `setCache()` writes the full config object to Redis under the `endpointPath` key.

This means the schema, mapping, functions, and related_transaction always reflect what is currently in the database, while `publishing_status` reflects exactly what the caller requested.
