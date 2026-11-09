# Truliva IoT – Data Reporting Guide

Companion to [IOT_PARTNER_INTEGRATION_GUIDE.md](IOT_PARTNER_INTEGRATION_GUIDE.md). Version 1.0 (draft), 2026-11-09.

## 1. What to report
| Group | Fields | Required? | Used for |
|---|---|---|---|
| Identity | `sn`, `fw` | Required | Device registration, firmware tracking |
| Water quality | `tdsIn`, `tdsOut` (ppm) | Required | TDS alerts |
| Operation | `pump` (0/1/2), `flowRate`, `pressure`, `total_l` | Recommended | Usage and health monitoring |
| Filter life | `ppc`, `ro`, `cto` (%), `ppc_replace`, `ro_replace`, `cto_replace` (bool) | Recommended | Filter replacement alerts |
| Health | `err` (0 = OK), `uart_ok` | Required | Error alerts |
| Time | `ts` (Unix seconds) | Optional | Event time; the server uses its own time if absent |

Send all fields in every message so the dashboard always shows a full snapshot. Use camelCase names. The `snake_case` aliases (`tds_in`, `tds_out`, `flow`) are accepted for legacy firmware only.

## 2. When to report
| Event | Topic | Timing |
|---|---|---|
| Boot / reconnect | `status` `{"online":true}` + one `telemetry` | Immediately |
| Periodic telemetry | `telemetry` | Every **300 s** by default (the platform default for `set_interval`). The partner may choose 30–300 s. The server stores a record at most every **2 min**, or sooner when a value changes. |
| Value change | `telemetry` | Immediately on a pump state change, a new error code, or a filter-replace flag change. |
| Disconnect | `status` `{"online":false}` | Set as the MQTT Last Will (published by the broker). |
| Command received | `command/response` | Right after the command is processed. For OTA, send progress updates, then `completed` or `rolled_back`. |

## 3. Platform behaviour you should know
- **Offline:** if no message arrives for **30 min**, the platform raises an OFFLINE alert. Keep the reporting interval well below 30 min.
- **TDS:** `tdsOut` above 50 ppm raises a WARNING, and above 100 ppm raises a CRITICAL alert.
- **Filters and errors:** a `*_replace: true` flag, `uart_ok: false`, `err` > 0 or `pump: 2` each raise an alert.
- **Auto-resolve:** alerts clear when later telemetry returns to normal (for example `tdsOut` back under the threshold, `uart_ok: true`, replace flags `false`). Keep reporting after an error so the alert can clear.
- **Serial:** the `sn` field must equal the `<SERIAL>` in the topic, or the message is rejected.
- **Format:** the payload must be valid JSON. Invalid messages are dropped.
- **QoS:** use QoS 1 for all publishes.

## 4. Example
Normal periodic report:
```json
{"sn":"TRL0001","fw":"1.2.0","ts":1731140000,"tdsIn":180,"tdsOut":12,"flowRate":1.8,"pressure":3.2,"pump":1,"err":0,"total_l":1520,"ppc":85,"ro":70,"cto":90,"ppc_replace":false,"ro_replace":false,"cto_replace":false,"uart_ok":true}
```
Event report (RO filter expired): same message with `"ro":0,"ro_replace":true`, sent immediately.

## 5. To confirm before sharing
- Whether the 300 s default and the 30–300 s range are the interval we want partners to use.
- The sandbox environment details for partner testing.

