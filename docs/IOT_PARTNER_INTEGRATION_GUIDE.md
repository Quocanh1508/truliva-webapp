# Truliva IoT Platform — Device Integration & Data Reporting Specification (MQTT)

| | |
|---|---|
| **Document version** | 1.0 |
| **Date** | 2026-11-09 |
| **Audience** | Hardware / firmware partners integrating devices with the Truliva IoT Platform |
| **Scope** | Device-level MQTT integration: connection, authentication, topics, data schema, reporting policy, commands |

---

## 1. Overview

Each device connects to the Truliva MQTT broker with its own credentials and exchanges UTF-8 JSON messages on topics scoped to its serial number. The Truliva platform:

- receives telemetry and stores it,
- tracks each device's online/offline state,
- raises alerts automatically (water quality, filter life, hardware faults, connectivity),
- sends commands to devices (reporting interval, ping, reboot, OTA firmware update).

```
┌──────────────┐      MQTT (TCP 1883)      ┌──────────────┐        ┌──────────────────┐
│ Device (MCU) │ ◄───────────────────────► │ Truliva MQTT │ ◄────► │ Truliva Platform │
│  <SERIAL>    │  telemetry/status/resp ►  │    Broker    │        │ (storage/alerts) │
│              │  ◄ command                └──────────────┘        └──────────────────┘
└──────────────┘
```

**General rules**

- All payloads are JSON objects encoded as UTF-8. Non-JSON payloads are dropped.
- Field names are case-sensitive.
- Devices **must ignore unknown fields** in incoming command payloads. The platform may add fields in future versions.
- The platform ignores unknown telemetry fields for processing but keeps the full original payload for diagnostics.

---

## 2. Connection & Authentication

### 2.1 Broker parameters

| Parameter | Value |
|---|---|
| Broker host | `221.132.21.42` (DNS: `trulivaofficial.com`) |
| Port | `1883` |
| Transport | MQTT over plain TCP. **TLS is not enabled on the broker.** |
| Protocol version | MQTT 3.1.1 (MQTT 5.0 also accepted) |
| Client ID | `<SERIAL>`: the device serial number, unique per device |
| Username | `<SERIAL>`: **must equal the Client ID** |
| Password | Issued by Truliva per device (see 2.2) |
| Keep-Alive | `60` seconds |
| Clean Session | `true` |
| Anonymous access | Not allowed |

> [!IMPORTANT]
> Because Clean Session is `true`, the broker does **not** queue commands for a disconnected device. Commands sent while a device is offline are lost. Devices must re-subscribe to their command topic after every (re)connect.

### 2.2 Credential issuing

1. The partner gives Truliva the list of device serial numbers to provision.
2. Truliva creates one broker account per serial number:
   - **Username** = serial number
   - **Password** = a unique, randomly generated secret per device
3. Credentials are delivered through `[CREDENTIAL_DELIVERY_CHANNEL]`. They must be stored in the device's non-volatile storage and never shared between devices.
4. To revoke or rotate credentials, contact `[TRULIVA_TECHNICAL_CONTACT]`.

### 2.3 Serial number rules

- Format: `[SERIAL_FORMAT]` (example: `TRU-MLN-2026070001`).
- Allowed characters: `A–Z`, `a–z`, `0–9`, `-`, `_`. MQTT reserved characters (`/`, `+`, `#`) are not allowed.
- The serial number is the device's permanent identity. It appears in the Client ID, the username, every topic, and the `sn` telemetry field.

### 2.4 Access control (ACL)

Each device may only use topics that contain its own username:

| Topic | Device permission |
|---|---|
| `truliva/devices/<SERIAL>/telemetry` | Publish |
| `truliva/devices/<SERIAL>/status` | Publish (including LWT) |
| `truliva/devices/<SERIAL>/command/response` | Publish |
| `truliva/devices/<SERIAL>/command` | Subscribe |

Publishing or subscribing outside these topics is denied by the broker.

### 2.5 Reconnection requirements

| Situation | Required behaviour |
|---|---|
| MQTT connection lost | Reconnect with backoff: start at 2 s, double on each failure, cap at 60 s. |
| Authentication rejected (bad username/password) | Retry no more often than every 30 s. Do not loop rapidly. |
| After every successful (re)connect | Run the full **On-Connect sequence** (Section 4.2.1). |

---

## 3. Topics

`<SERIAL>` = device serial number (= Client ID = username).

| Topic | Direction | QoS | Retain | Purpose |
|---|---|---|---|---|
| `truliva/devices/<SERIAL>/telemetry` | Device → Platform | 1 | `false` | Sensor and state data (Section 4.1) |
| `truliva/devices/<SERIAL>/status` | Device → Platform | 1 | **`true`** | Online/offline state and LWT (Section 4.3) |
| `truliva/devices/<SERIAL>/command` | Platform → Device | 1 | `false` | Commands (Section 4.4) |
| `truliva/devices/<SERIAL>/command/response` | Device → Platform | 1 | `false` | Command results and OTA progress (Section 4.4) |

- Devices **must ignore** any command message delivered with the retain flag set. This prevents stale commands such as `reboot` from running again on every reconnect.
- A device is auto-registered on the platform on its first valid telemetry message. It must still be provisioned with broker credentials first (Section 2.2).

---

## 4. Message Specifications

### 4.1 Telemetry: Data Dictionary

**Topic:** `truliva/devices/<SERIAL>/telemetry` · **QoS 1** · **Retain `false`**

Every telemetry message is a **full snapshot**: always send all fields. If a value is not available (sensor missing or not readable), send `null`. Do not omit the field, and do not substitute `0` or `false`. `null` means "not available".

#### 4.1.1 Example

```json
{
  "sn": "TRU-MLN-2026070001",
  "fw": "1.2.0",
  "ts": 1731140000,
  "tdsIn": 245,
  "tdsOut": 12,
  "flowRate": 1.5,
  "pressure": 45.0,
  "pump": 1,
  "err": 0,
  "total_l": 4508.0,
  "ppc": 80,
  "ro": 60,
  "cto": 35,
  "ppc_replace": false,
  "ro_replace": false,
  "cto_replace": false,
  "uart_ok": true,
  "interval": 120,
  "seq": 128,
  "rssi": -58,
  "uptime": 642,
  "heap": 154320
}
```

#### 4.1.2 Core fields (processed by the platform)

| Field | Type | Required | Unit | Description |
|---|---|---|---|---|
| `sn` | string | **Yes** | – | Device serial number. **Must exactly equal `<SERIAL>` in the topic**, otherwise the message is rejected. |
| `fw` | string | **Yes** | – | Running firmware version, semantic versioning (e.g. `"1.2.0"`). |
| `ts` | integer | No | seconds (Unix epoch, UTC) | Measurement time. **Include only when the device clock is synchronised via NTP.** If omitted, the platform uses the time the message is received. Never send uptime or an unsynchronised clock here. |
| `tdsIn` | number \| null | **Yes** | ppm (mg/L) | Total Dissolved Solids of inlet (raw) water. |
| `tdsOut` | number \| null | **Yes** | ppm (mg/L) | TDS of outlet (purified) water. Drives water-quality alerts. |
| `flowRate` | number \| null | **Yes** | L/min | Instantaneous purified-water flow rate. |
| `pressure` | number \| null | **Yes** | psi | Water pressure. |
| `pump` | integer \| null | **Yes** | enum | Pump state: `0` = OFF, `1` = RUNNING, `2` = ERROR. |
| `err` | integer | **Yes** | enum | Device error code. `0` = no error; see Section 4.1.4. If several errors are active, report the highest-priority one. |
| `total_l` | number \| null | **Yes** | L | Cumulative volume of water filtered (monotonic counter). |
| `ppc` | integer \| null | **Yes** | % (0–100) | Remaining life of Filter 1: PPC/PGP filter (3-stage purifiers: UR5676, UR5840) or PCB filter (2-stage purifiers: UR61096H). (Field alias `pcb` also supported by platform). |
| `ro` | integer \| null | **Yes** | % (0–100) | Remaining life of Filter 2: RO membrane (all models). |
| `cto` | integer \| null | **Yes** | % (0–100) | Remaining life of Filter 3: CTO carbon filter (3-stage purifiers). For 2-stage purifiers (UR61096H), send `null`. |
| `ppc_replace` | boolean \| null | **Yes** | – | `true` when Filter 1 (PPC/PGP/PCB) must be replaced. (Field alias `pcb_replace` also supported). |
| `ro_replace` | boolean \| null | **Yes** | – | `true` when Filter 2 (RO) must be replaced. |
| `cto_replace` | boolean \| null | **Yes** | – | `true` when Filter 3 (CTO) must be replaced. For 2-stage purifiers, send `null`. |
| `uart_ok` | boolean | **Yes** | – | Health of the link between the IoT module and the purifier main board. `false` = no data from the main board. When `false`, all water/filter fields must be `null`. |

#### 4.1.3 Diagnostic fields (stored for troubleshooting)

| Field | Type | Required | Unit | Description |
|---|---|---|---|---|
| `interval` | integer | **Yes** | seconds | Reporting interval currently in effect (Section 4.2.2). |
| `seq` | integer | Recommended | – | Message sequence number; restarts at 1 after each boot. |
| `rssi` | integer | Recommended | dBm | Wi-Fi / radio signal strength. |
| `uptime` | integer | Recommended | seconds | Time since last boot. |
| `heap` | integer | Recommended | bytes | Free RAM (memory-leak monitoring). |

#### 4.1.4 Error code reference (`err`)

The platform raises a `DEVICE_ERROR` alert (severity WARNING) for **any** `err` value greater than `0`. The meaning of each code is defined by the device hardware and must be agreed before mass production:

| Code | Meaning | Platform behaviour |
|---|---|---|
| `0` | No error / normal operation | No alert |
| `[1]` | `[ERROR_DESCRIPTION_1]` | `DEVICE_ERROR` alert |
| `[2]` | `[ERROR_DESCRIPTION_2]` | `DEVICE_ERROR` alert |
| `[3]` | `[ERROR_DESCRIPTION_3]` | `DEVICE_ERROR` alert |
| `[n]` | `[ERROR_DESCRIPTION_n]` | `DEVICE_ERROR` alert |

> [!NOTE]
> Pump faults are reported via `pump = 2`. Main-board link faults are reported via `uart_ok = false`. Filter end-of-life is reported via `*_replace = true`. These conditions have dedicated alerts and do not need their own `err` code.

#### 4.1.5 Platform alert rules (reference)

Firmware does not implement these rules, but they define which state changes matter (Section 4.2.3).

| Alert | Condition (evaluated on every telemetry message) | Severity | Auto-resolves when |
|---|---|---|---|
| `TDS_CRITICAL` | `tdsOut` > 100 ppm | CRITICAL | `tdsOut` ≤ 50 ppm |
| `TDS_HIGH` | 50 < `tdsOut` ≤ 100 ppm | WARNING | `tdsOut` ≤ 50 ppm |
| `FILTER_PPC_REPLACE` | `ppc_replace` = `true` | WARNING | `ppc_replace` = `false` |
| `FILTER_RO_REPLACE` | `ro_replace` = `true` | CRITICAL | `ro_replace` = `false` |
| `FILTER_CTO_REPLACE` | `cto_replace` = `true` | WARNING | `cto_replace` = `false` |
| `UART_ERROR` | `uart_ok` = `false` | WARNING | `uart_ok` = `true` |
| `PUMP_ERROR` | `pump` = `2` | CRITICAL | – (resolved by Truliva operator) |
| `DEVICE_ERROR` | `err` > `0` | WARNING | – (resolved by Truliva operator) |
| `OFFLINE` | `status` = `{"online":false}`, **or** no telemetry for 30 min | WARNING | Next valid telemetry message |
| `OTA_ROLLBACK` | OTA response `status` = `"rolled_back"` | WARNING | – |

The same alert type is not raised more than once per 15 minutes per device.

#### 4.1.6 Filter Lifecycles & Indicator Mapping Specification (Thresholds & UI)

| Model | Stages | Filter 1 | Filter 2 | Filter 3 | Indicator Type | Thresholds & Indicator Status |
|---|---|---|---|---|---|---|
| **UR5676** | 3 | **PGP**<br>(6–12 months) | **RO**<br>(24–36 months) | **CTO**<br>(6–12 months) | **BARS** (vạch) | • **> 25%**: 2, 3, 4 vạch xanh → *"Đang tốt"*<br>• **10%–25%**: 1 vạch xanh → *"Sắp thay"*<br>• **< 10%** (hoặc `replace=true`): 1 vạch nháy đỏ → *"Cần thay"* |
| **UR5840** | 3 | **PGP**<br>(6–12 months) | **RO**<br>(24–36 months) | **CTO**<br>(6–12 months) | **BARS** (vạch) | • **> 25%**: 2, 3, 4 vạch xanh → *"Đang tốt"*<br>• **10%–25%**: 1 vạch xanh → *"Sắp thay"*<br>• **< 10%** (hoặc `replace=true`): 1 vạch nháy đỏ → *"Cần thay"* |
| **UR61096H** | 2 | **PCB**<br>(6–12 months) | **RO**<br>(3–8 years / 36–96 months) | *N/A (send null)* | **LIGHT** (đèn) | • **> 25%**: PCB sáng đèn trắng → *"Đang tốt"*<br>• **10%–25%**: PCB sáng đèn trắng → *"Sắp thay"*<br>• **< 10%** (hoặc `replace=true`): PCB nháy đèn đỏ → *"Cần thay"* |

---

### 4.2 Reporting Policy & Triggers

#### 4.2.1 On boot / on every (re)connect

The device must perform these steps in order on every successful connection:

| Step | Action | Topic | QoS / Retain |
|---|---|---|---|
| 1 | Register the LWT in the CONNECT packet: `{"online":false}` | `.../status` | QoS 1 / retain `true` |
| 2 | Publish `{"online":true}` | `.../status` | QoS 1 / retain `true` |
| 3 | Subscribe to the command topic | `.../command` | QoS 1 |
| 4 | Publish one full telemetry snapshot immediately | `.../telemetry` | QoS 1 / retain `false` |
| 5 | If an OTA was pending before the reboot, publish the OTA result (`completed` or `rolled_back`, Section 4.4.5) | `.../command/response` | QoS 1 / retain `false` |

#### 4.2.2 Periodic reporting (heartbeat)

| Parameter | Value |
|---|---|
| Factory default interval | `[DEFAULT_INTERVAL_S]` seconds (recommended: **120 s**) |
| Accepted range (`set_interval`) | 1–3600 seconds |
| Maximum gap between telemetry messages | **Must stay under 30 minutes** (offline threshold) |
| Persistence | The interval set by `set_interval` must be stored in non-volatile memory and survive reboot and OTA. |

How the interval interacts with the platform:

- **Liveness is based on telemetry only.** The platform records "last seen" when a telemetry message arrives. It checks every 5 minutes and marks a device OFFLINE after **30 minutes** without telemetry, even if the broker connection and `{"online":true}` status are still up. The periodic timer must keep running whatever the sensor state, including when `uart_ok = false`.
- **Storage window: 120 s.** Every telemetry message updates the live dashboard immediately. A history record is written when one of `tdsOut`, `ppc`, `ro`, `cto` or `err` changes, or when 120 s have passed since the last stored record. Intervals shorter than 120 s give near-real-time dashboards without bloating history. Intervals longer than 120 s give one stored record per message.
- **Effect of `set_interval`:** apply the new value immediately, reset the periodic timer, and publish one telemetry snapshot straight away (Section 4.4.2).

#### 4.2.3 Event-driven (immediate) reporting

Publish a full telemetry snapshot **immediately**, without waiting for the periodic timer, when any of the following occurs. These are the exact conditions the platform uses to store new history records or evaluate alerts.

| # | Trigger | Why |
|---|---|---|
| E1 | `err` changes value (including returning to `0`) | Stored immediately; raises `DEVICE_ERROR` |
| E2 | `pump` changes state, especially any transition to or from `2` (ERROR) | Raises `PUMP_ERROR` |
| E3 | `uart_ok` changes (`true` ↔ `false`) | Raises / resolves `UART_ERROR` |
| E4 | `ppc_replace`, `ro_replace` or `cto_replace` changes | Raises / resolves filter alerts |
| E5 | `ppc`, `ro` or `cto` changes value (integer %) | Stored immediately |
| E6 | `tdsOut` crosses a threshold in either direction: 50 ppm or 100 ppm | Raises / resolves TDS alerts |
| E7 | `ping` command received | Required by command contract (Section 4.4.3) |
| E8 | `set_interval` command applied successfully | Required by command contract (Section 4.4.2) |

**Rate limiting:** event-driven messages must be at least **1 second** apart. If several triggers fire within that second, send one snapshot that reflects all of them. Event-driven messages do not reset the periodic timer, except after `set_interval`.

**Small `tdsOut` fluctuations** that do not cross 50 or 100 ppm do **not** need an immediate message. They are picked up by the next periodic report.

#### 4.2.4 Planned shutdown / reboot

Before any intentional restart (the `reboot` command, after an OTA install, or after a local configuration change), publish `{"online":false}` (QoS 1, retain `true`) to the status topic, then disconnect cleanly.

---

### 4.3 Status & Last Will and Testament (LWT)

**Topic:** `truliva/devices/<SERIAL>/status`

| Message | Payload | Published by | QoS | Retain | When |
|---|---|---|---|---|---|
| Online | `{"online":true}` | Device | 1 | **`true`** | Immediately after each successful connect (Step 2 in 4.2.1) |
| Offline (LWT) | `{"online":false}` | Broker, on the device's behalf | 1 | **`true`** | Registered in CONNECT. Published by the broker when the device disappears without a clean disconnect (about 1.5 × Keep-Alive ≈ **90 s**) |
| Offline (planned) | `{"online":false}` | Device | 1 | **`true`** | Right before an intentional reboot or shutdown (4.2.4) |

Rules:

- `online` must be a JSON **boolean** (`true` / `false`), not a string or number.
- Retain is required so the platform always gets the latest state of every device, including after a platform restart.
- On `{"online":false}` the platform marks the device offline and raises an `OFFLINE` alert. The next valid telemetry message marks it online again and resolves the alert.

---

### 4.4 Commands & Responses

**Command topic (Platform → Device):** `truliva/devices/<SERIAL>/command` · QoS 1 · retain `false`
**Response topic (Device → Platform):** `truliva/devices/<SERIAL>/command/response` · QoS 1 · retain `false`

**Command envelope (flat JSON):**

```json
{ "cmd": "<command>", "id": "<request id>", "...": "<command parameters>" }
```

**Response envelope:**

```json
{ "id": "<same id>", "cmd": "<same command>", "ok": true, "...": "<result fields>" }
```

| Rule | Detail |
|---|---|
| Correlation | The device **must echo `id` and `cmd` exactly** in every response, including errors and every OTA progress message. |
| `id` format | Generated by the platform (default format `req-<unix-ms>`, e.g. `req-1731140000123`). Max length 47 characters. |
| Max command size | 767 bytes. |
| Unknown fields | Ignore them. |
| Retained commands | Ignore them (Section 3). |
| One response per command | Exception: `ota`, which sends a sequence of progress responses. |

**Common error responses**

| `error` | Cause |
|---|---|
| `invalid_command` | Payload is not valid JSON or has no `cmd` |
| `unknown_command` | `cmd` is not supported |
| `invalid_interval` | `interval` missing or outside 1–3600 |
| `invalid_args` | Missing or invalid parameters (e.g. OTA `url` / `version` / `sha256`) |
| `busy` | Another OTA is in progress |
| `too_long` | Command payload exceeds 767 bytes |

```json
{ "id": "req-1731140000123", "cmd": "abc", "ok": false, "error": "unknown_command" }
```

#### 4.4.1 Supported commands

| Command | Purpose |
|---|---|
| `set_interval` | Change the periodic telemetry interval |
| `ping` | Request an immediate telemetry snapshot |
| `reboot` | Restart the device |
| `ota` | Download and install new firmware |

#### 4.4.2 `set_interval`

| Parameter | Type | Required | Unit | Description |
|---|---|---|---|---|
| `interval` | integer | Yes | seconds | New reporting interval, 1–3600 |

Platform → Device:
```json
{ "cmd": "set_interval", "id": "req-1731140000123", "interval": 120 }
```

Device → Platform (success). `interval` must contain the value now in effect:
```json
{ "id": "req-1731140000123", "cmd": "set_interval", "ok": true, "interval": 120 }
```

Device → Platform (failure):
```json
{ "id": "req-1731140000123", "cmd": "set_interval", "ok": false, "error": "invalid_interval" }
```

On success the device persists the value, restarts its periodic timer, and publishes one telemetry snapshot immediately.

#### 4.4.3 `ping`

Platform → Device:
```json
{ "cmd": "ping", "id": "req-1731140000456" }
```

Device → Platform:
```json
{ "id": "req-1731140000456", "cmd": "ping", "ok": true }
```

Right after the response, the device publishes one full telemetry snapshot.

#### 4.4.4 `reboot`

Platform → Device:
```json
{ "cmd": "reboot", "id": "req-1731140000789" }
```

Device → Platform:
```json
{ "id": "req-1731140000789", "cmd": "reboot", "ok": true }
```

Sequence:
1. Send the response.
2. Wait about 1 s.
3. Publish `{"online":false}` (retained).
4. Restart.
5. After reconnecting, run the On-Connect sequence (4.2.1).

#### 4.4.5 `ota` (firmware update)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | `https://` or `http://` URL of the firmware binary, max 255 characters |
| `version` | string | Yes | Target firmware version. Must match the version embedded in the binary. |
| `sha256` | string | Yes | SHA-256 of the complete binary, 64 lowercase hex characters |
| `force` | boolean | No | `true` allows reinstalling the currently running version. Default `false`. |

Platform → Device:
```json
{
  "cmd": "ota",
  "id": "ota-2026-11-09-01",
  "url": "[FIRMWARE_BASE_URL]/firmware-1.3.0.bin",
  "version": "1.3.0",
  "sha256": "9f2c4e7a0b1d3c5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6",
  "force": false
}
```

Device → Platform: progress sequence. Every message carries the same `id` and `"cmd":"ota"`:

| `status` | Meaning | `progress` |
|---|---|---|
| `accepted` | Parameters valid, download starting | `0` |
| `downloading` | Download in progress, reported at least every 10 % | `0`–`100` |
| `success` | Image downloaded and verified (SHA-256 + image check) and set as boot image. Device reboots about 3 s later. | `100` |
| `completed` | Sent **after reboot**, once the new firmware connects to the broker. The platform then updates the device's firmware version to `version`. | `100` |
| `rolled_back` | The new firmware failed before confirming and the device reverted to the previous firmware. Sent after the old firmware reconnects. | – |

```json
{ "id": "ota-2026-11-09-01", "cmd": "ota", "ok": true, "status": "accepted",    "version": "1.3.0", "progress": 0 }
{ "id": "ota-2026-11-09-01", "cmd": "ota", "ok": true, "status": "downloading", "version": "1.3.0", "progress": 50 }
{ "id": "ota-2026-11-09-01", "cmd": "ota", "ok": true, "status": "success",     "version": "1.3.0", "progress": 100 }
{ "id": "ota-2026-11-09-01", "cmd": "ota", "ok": true, "status": "completed",   "version": "1.3.0", "progress": 100 }
```

Rollback:
```json
{ "id": "ota-2026-11-09-01", "cmd": "ota", "ok": false, "status": "rolled_back", "version": "1.3.0", "error": "new_firmware_not_confirmed" }
```

Failure during download or verification. The device aborts, keeps running the current firmware, and does **not** reboot:
```json
{ "id": "ota-2026-11-09-01", "cmd": "ota", "ok": false, "status": "failed", "version": "1.3.0", "error": "sha256_mismatch" }
```

OTA error codes:

| `error` | Cause |
|---|---|
| `invalid_args` | Missing or invalid `url` / `version` / `sha256` |
| `busy` | Another OTA is already running |
| `http_connect_failed` | Cannot reach the firmware server |
| `http_status` | Firmware server returned a non-200 status |
| `download_failed` | Connection lost or file incomplete |
| `too_large` | Binary larger than the device's OTA partition |
| `not_firmware` / `wrong_project` | File is not valid firmware for this device |
| `version_mismatch` | `version` differs from the version inside the binary |
| `same_version` | Same as the running version and `force` is not `true` |
| `image_invalid` | Image checksum failed |
| `sha256_mismatch` | SHA-256 does not match `sha256` |
| `flash_write_failed` | Flash write / boot-partition error |
| `no_memory` | Insufficient RAM |
| `new_firmware_not_confirmed` | Rollback occurred |

OTA device requirements:
- Only one OTA at a time. Reject concurrent requests with `busy`.
- Keep publishing telemetry during the download.
- New firmware stays in a "pending verification" state until it connects to the broker. If it crashes or resets before that, the bootloader must roll back automatically.
- Device configuration (credentials, `interval`) must survive the OTA.

---

## 5. Integration Acceptance Checklist

The device is ready for production when all of the following pass in Truliva's test session:

| # | Test | Expected result |
|---|---|---|
| 1 | Connect with the issued credentials | Connection accepted; `{"online":true}` retained on `status` |
| 2 | On-connect telemetry | One full snapshot received within 5 s of connecting, with all fields from 4.1.2 present |
| 3 | Serial consistency | `sn` = Client ID = username = topic `<SERIAL>` |
| 4 | Periodic reporting | Messages arrive at the configured `interval` (±10 %) |
| 5 | `set_interval` | Correct response with `id` echoed; immediate snapshot; new interval kept after reboot |
| 6 | `ping` | Response plus immediate snapshot |
| 7 | `reboot` | Response, `{"online":false}`, reconnect, `{"online":true}`, snapshot |
| 8 | Power cut | Broker publishes LWT `{"online":false}` within about 90 s |
| 9 | Event triggers E1–E6 | Snapshot published within 1–2 s of each trigger |
| 10 | `uart_ok = false` | Water and filter fields sent as `null`; periodic reporting continues |
| 11 | Retained command | Device ignores it |
| 12 | OTA success / bad SHA-256 / rollback | Status sequences match 4.4.5 |

**Technical contact:** `[TRULIVA_TECHNICAL_CONTACT]`
