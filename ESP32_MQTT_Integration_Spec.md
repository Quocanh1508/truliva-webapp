# TÀI LIỆU TÍCH HỢP ESP32 QUA MQTT — TRULIVA IOT

Tài liệu hướng dẫn nhúng MQTT Client cho lập trình viên ESP32 (máy lọc nước Truliva).

---

## 1. Thông Tin Kết Nối (MQTT Broker)

| Thông số | Giá trị |
|---|---|
| **Server Host** | `221.132.21.42` *(Tên miền: `trulivaofficial.com`)* |
| **Port** | `1883` (TCP) |
| **Protocol** | MQTT v3.1.1 hoặc v5.0 |
| **Username** | Số Serial của máy (VD: `TRU-MLN-2026070001`) |
| **Password** | Được cấp khi đăng ký thiết bị trên Admin Dashboard |
| **Client ID** | Trùng với Số Serial của máy (`<SERIAL_NUMBER>`) |
| **Clean Session** | `true` |
| **KeepAlive** | `60` giây |

---

## 2. Topics & Quy Định Phân Quyền (ACL)

Mỗi thiết bị ESP32 chỉ được quyền kết nối và tương tác trên topic chứa **Số Serial** của chính thiết bị đó:

| Hướng dữ liệu | Topic Pattern | QoS | Mục đích |
|---|---|---|---|
| **ESP32 → Server** | `truliva/devices/<SERIAL>/telemetry` | 1 | Gửi dữ liệu cảm biến (tần suất định kỳ hoặc cảnh báo) |
| **ESP32 → Server** | `truliva/devices/<SERIAL>/status` | 1 | Gửi tin nhắn Last Will & Testament (LWT) báo mất kết nối |
| **Server → ESP32** | `truliva/devices/<SERIAL>/command` | 1 | Nhận lệnh điều khiển/cấu hình từ Server |

---

## 3. Format Dữ Liệu (JSON Payload)

### 3.1. Dữ liệu cảm biến Telemetry (ESP32 publish định kỳ)

- **Topic**: `truliva/devices/<SERIAL>/telemetry`
- **Tần suất đề xuất**: 5 phút / 1 lần (hoặc gửi ngay khi phát hiện chỉ số bất thường)

```json
{
  "sn": "TRU-MLN-2026070001",
  "fw": "1.0.0",
  "tds_in": 245,
  "tds_out": 12,
  "flow": 1.5,
  "total_l": 4508,
  "pressure": 45,
  "pump": 1,
  "err": 0,
  "ts": 1722054236
}
```

#### Bảng mô tả các trường dữ liệu:

| Trường | Kiểu dữ liệu | Bắt buộc | Mô tả & Đơn vị |
|---|---|---|---|
| `sn` | `string` | **Bắt buộc** | Số Serial của thiết bị (phải khớp với Username & Topic) |
| `fw` | `string` | Tùy chọn | Phiên bản Firmware hiện tại (VD: `"1.0.0"`) |
| `tds_in` | `number` | Tùy chọn | Chỉ số TDS nước đầu vào (đơn vị: ppm) |
| `tds_out` | `number` | **Bắt buộc** | Chỉ số TDS nước đầu ra sau lọc RO (đơn vị: ppm) |
| `flow` | `number` | Tùy chọn | Lưu lượng nước lọc tức thời (đơn vị: Lít / phút) |
| `total_l` | `number` | Tùy chọn | Tổng số lít nước đã qua lọc kể từ khi thay lõi |
| `pressure` | `number` | Tùy chọn | Áp suất nước đầu vào (đơn vị: psi) |
| `pump` | `number` | Tùy chọn | Trạng thái bơm: `0` = TẮT, `1` = ĐANG CHẠY, `2` = LỖI |
| `err` | `number` | Tùy chọn | Mã lỗi phần cứng (`0` = Bình thường, `>0` = Mã lỗi) |
| `ts` | `number` | Tùy chọn | Unix Timestamp (tính theo giây). Nếu không có, Server tự lấy giờ hệ thống |

> [!TIP]
> Các trường tùy chọn nếu cảm biến chưa đọc được thì **có thể bỏ qua**, Server tự động lưu `null` và giữ nguyên các trường gốc trong JSON `raw_payload`.

---

### 3.2. Cấu hình Last Will & Testament (LWT)

Khi thiết bị mất nguồn hoặc mất mạng đột ngột, MQTT Broker sẽ tự động gửi message này để thông báo cho Server:

- **Topic**: `truliva/devices/<SERIAL>/status`
- **QoS**: `1`
- **Retain**: `true`
- **Payload**:
```json
{
  "online": false
}
```

Khi ESP32 kết nối lại thành công, hãy publish lên topic status:
```json
{
  "online": true
}
```

---

### 3.3. Nhận lệnh từ Server (Command)

ESP32 **Subscribe** vào topic `truliva/devices/<SERIAL>/command`. Server có thể gửi các lệnh JSON dạng:

#### Lệnh khởi động lại (Reboot):
```json
{
  "cmd": "reboot",
  "params": {}
}
```

#### Lệnh thay đổi tần suất gửi data (Interval):
```json
{
  "cmd": "set_interval",
  "params": {
    "interval_s": 300
  }
}
```

#### Lệnh cập nhật Firmware OTA (Phase 2):
```json
{
  "cmd": "ota_update",
  "params": {
    "url": "https://domain.com/firmware/v1.0.1.bin",
    "version": "1.0.1"
  }
}
```

---

## 4. Yêu Cầu Kỹ Thuật Đề Xuất Cho ESP32 Firmware

1. **Auto-reconnect**: Khi mất kết nối WiFi hoặc MQTT Broker, ESP32 tự động reconnect sử dụng thuật toán Backoff (2s → 4s → 8s → tối đa 60s) để tránh làm nghẽn broker.
2. **Buffering khi mất mạng**: Nếu mất mạng tạm thời, lưu tối đa 10-20 bản ghi vào RAM/EEPROM và push lại khi có kết nối.
3. **Đồng bộ thời gian NTP**: Nên đồng bộ NTP (Pool Server `pool.ntp.org`) khi khởi động để gửi timestamp `ts` chính xác.

---

## 5. Ví Dụ Cài Đặt Trên ESP32 (Arduino C++)

Dùng thư viện `PubSubClient`:

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASS";
const char* mqtt_server = "221.132.21.42";
const int mqtt_port = 1883;

const char* device_serial = "TRU-TEST-001";
const char* mqtt_user = "TRU-TEST-001";
const char* mqtt_pass = "test123456";

WiFiClient espClient;
PubSubClient client(espClient);

void setup_wifi() {
  delay(10);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void callback(char* topic, byte* message, unsigned int length) {
  // Xử lý lệnh nhận được từ Server
}

void reconnect() {
  while (!client.connected()) {
    String statusTopic = "truliva/devices/" + String(device_serial) + "/status";
    String lwtMessage = "{\"online\":false}";
    
    // Connect with Last Will
    if (client.connect(device_serial, mqtt_user, mqtt_pass, statusTopic.c_str(), 1, true, lwtMessage.c_str())) {
      // Báo online
      client.publish(statusTopic.c_str(), "{\"online\":true}", true);
      // Subscribe topic command
      String commandTopic = "truliva/devices/" + String(device_serial) + "/command";
      client.subscribe(commandTopic.c_str());
    } else {
      delay(5000);
    }
  }
}

void sendTelemetry(float tdsIn, float tdsOut, float flow, int pumpStatus) {
  StaticJsonDocument<256> doc;
  doc["sn"] = device_serial;
  doc["fw"] = "1.0.0";
  doc["tds_in"] = tdsIn;
  doc["tds_out"] = tdsOut;
  doc["flow"] = flow;
  doc["pump"] = pumpStatus;
  doc["ts"] = time(NULL);

  char buffer[256];
  serializeJson(doc, buffer);

  String telemetryTopic = "truliva/devices/" + String(device_serial) + "/telemetry";
  client.publish(telemetryTopic.c_str(), buffer);
}

void setup() {
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Gửi telemetry định kỳ mỗi 5 phút
  static unsigned long lastMsg = 0;
  if (millis() - lastMsg > 300000) {
    lastMsg = millis();
    sendTelemetry(250.0, 15.0, 1.8, 1);
  }
}
```
