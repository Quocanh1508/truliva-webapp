# Giao thức MQTT và OTA — máy lọc nước Truliva (ESP32)

Tài liệu dành cho bên phát triển server và người vận hành thiết bị. Áp dụng cho firmware **1.2.0** trở lên.

## 1. Kết nối broker

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Broker | `221.132.21.42` | Cố định trong firmware |
| Port | `1883` | MQTT TCP, không TLS |
| Client ID | Nhập trên trang cấu hình | Duy nhất cho mỗi máy |
| Username | **= Client ID** | Thiết bị tự dùng Client ID làm username |
| Password | Nhập trên trang cấu hình | |
| Keep Alive | 60 giây | Broker phát LWT sau khoảng 90 giây mất kết nối |
| Clean Session | `true` | Lệnh gửi lúc máy offline sẽ **không** được giữ lại |
| Tự kết nối lại MQTT | 30 giây/lần | |
| Tự kết nối lại WiFi | 2 giây sau khi rớt, sau đó 30 giây/lần | WiFi cấu hình không tự bật khi mất WiFi |

Broker, port, keepalive và định dạng topic được biên dịch sẵn trong firmware. Muốn đổi các giá trị này phải cập nhật firmware. Trang cấu hình trên thiết bị không hiển thị thông tin broker, chỉ hiển thị Client ID.

**Tự phục hồi khi WiFi vẫn có mạng mà không vào được broker:**
- Sau 2 phút: thiết bị khởi tạo lại MQTT client.
- Sau 5 phút: thiết bị ngắt rồi kết nối lại WiFi.
- Không áp dụng khi broker báo sai Client ID hoặc mật khẩu; trường hợp đó chỉ thử lại 30 giây/lần.

**Chống treo:** proxy UART chạy riêng trên core 1 với ưu tiên cao, nên WiFi, trang cấu hình, MQTT và OTA không làm chậm dữ liệu sang màn hình máy lọc. Các vòng lặp chính được watchdog theo dõi; nếu một vòng bị treo quá 30 giây, thiết bị tự khởi động lại.

## 2. Topic

`<id>` là Client ID của máy.

| Topic | Chiều | QoS | Retain | Nội dung |
|---|---|---|---|---|
| `truliva/devices/<id>/telemetry` | Máy → server | 0 | Không | Toàn bộ dữ liệu máy, mặc định 5 giây/lần |
| `truliva/devices/<id>/status` | Máy → server | 1 | **Có** | `{"online":true}` / `{"online":false}` |
| `truliva/devices/<id>/command` | Server → máy | 1 | **Không được retain** | Lệnh điều khiển |
| `truliva/devices/<id>/command/response` | Máy → server | 1 | Không | Kết quả lệnh và tiến trình OTA |

Server nên subscribe theo wildcard: `truliva/devices/+/telemetry`, `truliva/devices/+/status`, `truliva/devices/+/command/response`.

## 3. Status và LWT

- **Khi kết nối:** thiết bị đăng ký LWT là `{"online":false}` (QoS 1, retain).
- **Khi kết nối thành công:** thiết bị publish ngay `{"online":true}` (QoS 1, retain).
- **Mất điện hoặc mất mạng:** sau khoảng 1,5 × keepalive (~90 giây), broker tự publish `{"online":false}`.
- **Thiết bị chủ động khởi động lại** (lệnh `reboot`, sau OTA, lưu cấu hình): thiết bị gửi `{"online":false}` ngay trước khi reset, không phải chờ LWT.

Vì status là retained, server subscribe lúc nào cũng nhận được trạng thái mới nhất của từng máy.

## 4. Telemetry

Gửi định kỳ theo `interval` (mặc định 5 giây, đổi bằng lệnh `set_interval`). Ngoài ra thiết bị gửi thêm một bản ngay khi vừa kết nối, khi nhận lệnh `ping` và sau khi đổi chu kỳ.

```json
{
  "sn": "<Client ID người dùng nhập>",
  "tdsIn": null,
  "tdsOut": 35,
  "pressure": null,
  "flowRate": null,
  "pumpStatus": null,
  "rawWater": null,
  "pureWater": null,
  "errorCodes": null,
  "seq": 128,
  "uart_ok": true,
  "ppc": 80, "ppc_bars": 4, "ppc_replace": false,
  "ro": 60,  "ro_bars": 3,  "ro_replace": false,
  "cto": 2,  "cto_bars": 1, "cto_replace": true,
  "status": 0,
  "fw": "1.2.0",
  "ip": "192.168.1.23",
  "rssi": -58,
  "uptime": 642,
  "heap": 154320,
  "interval": 5
}
```

Phần đầu bản tin (từ `sn` đến `errorCodes`) theo đúng cấu trúc khách hàng cung cấp. **`null` nghĩa là máy lọc hiện không cung cấp giá trị đó**, không có nghĩa là `0` hay `false`. Server phải chấp nhận `null` ở các trường này.

| Trường | Hiện trạng | Ý nghĩa |
|---|---|---|
| `sn` | Có | Số serial của máy: đúng Client ID người dùng nhập trên trang cấu hình (cũng là Client ID/username MQTT). Mỗi máy một giá trị, đổi Client ID thì `sn` đổi theo. Luôn là trường đầu tiên |
| `tdsIn` | `null` | TDS nước vào. Giao thức hiện tại chưa có giá trị này (byte 16–17 luôn bằng TDS hiển thị) |
| `tdsOut` | Có | TDS đang hiển thị trên màn hình (ppm) |
| `pressure` | `null` | Máy không có cảm biến áp suất; cần lắp thêm phần cứng |
| `flowRate` | `null` | Máy không có đồng hồ lưu lượng; cần lắp thêm phần cứng |
| `pumpStatus` | `null` | Có thể nằm trong byte trạng thái chưa giải mã |
| `rawWater` | `null` | Có thể nằm trong byte trạng thái chưa giải mã |
| `pureWater` | `null` | Có thể nằm trong byte trạng thái chưa giải mã |
| `errorCodes` | `null` | Khi giải mã được sẽ là mảng; mảng rỗng `[]` nghĩa là không có lỗi |

Các trường còn lại là thông tin bổ sung của thiết bị:

| Trường | Ý nghĩa |
|---|---|
| `seq` | Số thứ tự bản tin, đếm lại từ 1 sau mỗi lần khởi động |
| `uart_ok` | `false` nếu 10 giây không nhận được dữ liệu từ bo máy lọc. Khi đó mọi trường dữ liệu nước là `null` |
| `ppc`, `ro`, `cto` | Phần trăm còn lại của từng lõi (0–100) |
| `*_bars` | Số vạch hiển thị trên màn hình (1–4) |
| `*_replace` | `true` khi màn hình báo đỏ nhấp nháy, cần thay lõi (giá trị ≤ 2) |
| `status` | Byte trạng thái thô của khung (byte 4), chưa giải mã |
| `fw` | Phiên bản firmware đang chạy |
| `ip`, `rssi` | IP trong mạng nhà, cường độ WiFi (dBm) |
| `uptime` | Số giây từ lần khởi động gần nhất |
| `heap` | RAM trống (byte), dùng để theo dõi rò rỉ bộ nhớ |
| `interval` | Chu kỳ gửi hiện tại (giây) |

Thiết bị không có đồng hồ thực. Server nên gắn thời gian lúc nhận bản tin.

## 5. Lệnh điều khiển

Gửi JSON tới `truliva/devices/<id>/command`, QoS 1, **không retain**. Thiết bị bỏ qua mọi lệnh retained, để tránh trường hợp ví dụ lệnh `reboot` bị chạy lại mỗi lần kết nối.

```json
{"cmd": "<tên lệnh>", "id": "<mã yêu cầu, tùy chọn>", ...tham số}
```

`id` do server tự đặt (tối đa 47 ký tự), được gửi lại nguyên văn trong phản hồi để server ghép cặp. Để thử bằng tay, có thể gửi chữ trần như `reboot` hoặc `ping` thay cho JSON.

Phản hồi trên `command/response`:

```json
{"id": "req-17", "cmd": "set_interval", "ok": true, "interval": 10}
{"id": "req-18", "cmd": "abc", "ok": false, "error": "unknown_command"}
```

### 5.1 `reboot`

```json
{"cmd": "reboot", "id": "req-1"}
```

Thiết bị trả `{"ok":true}`, sau 1 giây gửi `{"online":false}` rồi khởi động lại. Kết nối lại xong thì gửi `{"online":true}` và một bản telemetry.

### 5.2 `set_interval`

```json
{"cmd": "set_interval", "interval": 10, "id": "req-2"}
```

- `interval`: số giây từ 1 đến 3600.
- Có hiệu lực ngay, được lưu vào NVS nên giữ nguyên sau khi khởi động lại và sau OTA.
- Phản hồi: `{"ok":true,"interval":10}`. Nếu sai thì trả `{"ok":false,"error":"invalid_interval"}`.

### 5.3 `ping`

```json
{"cmd": "ping", "id": "req-3"}
```

Trả `{"ok":true}` và gửi ngay một bản telemetry.

### 5.4 `ota`

```json
{
  "cmd": "ota",
  "id": "ota-2026-10-02-01",
  "url": "http://221.132.21.42/firmware/truliva-1.3.0.bin",
  "version": "1.3.0",
  "sha256": "9f2c...64 ký tự hex...",
  "force": false
}
```

| Tham số | Bắt buộc | Ý nghĩa |
|---|---|---|
| `url` | Có | `http://` hoặc `https://`, tối đa 255 ký tự. HTTPS dùng bộ chứng chỉ CA công cộng có sẵn trong ESP-IDF |
| `version` | Có | Phải **trùng** với phiên bản ghi bên trong file `.bin` |
| `sha256` | Có | SHA-256 của toàn bộ file `.bin`, 64 ký tự hex |
| `force` | Không | `true` cho phép cài lại đúng phiên bản đang chạy |

Chi tiết quy trình ở mục 6.

### 5.5 Mã lỗi chung

| `error` | Nguyên nhân |
|---|---|
| `invalid_command` | JSON không có `cmd` |
| `unknown_command` | Lệnh không tồn tại |
| `invalid_interval` | `interval` thiếu hoặc ngoài khoảng 1–3600 |
| `invalid_args` | Lệnh `ota` thiếu hoặc sai `url` / `version` / `sha256` |
| `busy` | Đang có một OTA khác chạy |
| `too_long` | Payload lệnh dài hơn 767 byte |

## 6. Quy tắc OTA

### 6.1 Chuẩn bị firmware (phía phát triển)

1. Tăng phiên bản trong `firmware-pio/CMakeLists.txt`, ví dụ `set(PROJECT_VER "1.3.0")`. **Mỗi bản phát hành phải có phiên bản mới**, vì thiết bị từ chối cài lại phiên bản đang chạy nếu không có `force`.
2. Build bằng PlatformIO. File cần dùng là `.pio/build/esp32dev/firmware.bin`.
3. Tính SHA-256:
   - Windows: `certutil -hashfile firmware.bin SHA256`
   - Linux/macOS: `sha256sum firmware.bin`
4. Đưa file lên máy chủ HTTP(S) mà thiết bị truy cập được, rồi gửi lệnh `ota`.

### 6.2 Thiết bị xử lý

| Bước | Thiết bị làm gì | Phản hồi `status` |
|---|---|---|
| 1 | Kiểm tra tham số; từ chối nếu đang có OTA khác | `accepted` (hoặc lỗi `busy` / `invalid_args`) |
| 2 | Tải file qua HTTP(S), ghi thẳng vào khe OTA còn trống | `downloading` với `progress` 0–100, báo mỗi 10% |
| 3 | Đọc header ảnh: đúng chip ESP32, đúng project `tds_display_sniffer`, `version` khớp, khác phiên bản đang chạy (trừ khi `force`) | Lỗi nếu sai |
| 4 | Kiểm tra checksum ảnh (ESP-IDF) và so SHA-256 với tham số `sha256` | Lỗi nếu sai |
| 5 | Đặt khe mới làm khe khởi động, lưu `ota_id` / `ota_ver` vào NVS | `success` |
| 6 | Sau 3 giây gửi `{"online":false}` rồi khởi động lại vào firmware mới | |
| 7 | Firmware mới kết nối broker thành công → xác nhận bản cài là tốt | `completed` |

Mọi lỗi ở bước 2–5 đều hủy cập nhật. Thiết bị **vẫn chạy firmware cũ, không khởi động lại**.

Ví dụ chuỗi phản hồi của một lần OTA thành công:

```json
{"id":"ota-01","cmd":"ota","ok":true,"status":"accepted","version":"1.3.0","progress":0}
{"id":"ota-01","cmd":"ota","ok":true,"status":"downloading","version":"1.3.0","progress":10}
...
{"id":"ota-01","cmd":"ota","ok":true,"status":"success","version":"1.3.0","progress":100}
{"id":"ota-01","cmd":"ota","ok":true,"status":"completed","version":"1.3.0","progress":100}
```

### 6.3 Tự quay về bản cũ (rollback)

- Firmware mới ở trạng thái "chờ xác nhận" cho tới khi **kết nối được broker lần đầu**.
- Nếu firmware mới bị treo, reset, hoặc mất điện **trước khi** kết nối được broker, bootloader tự quay về firmware cũ ở lần khởi động kế tiếp.
- Firmware cũ kết nối lại thì báo `{"status":"rolled_back","error":"new_firmware_not_confirmed"}` kèm `id` của lệnh OTA.
- Server nhận `rolled_back` thì nên kiểm tra lại bản firmware rồi mới thử lại.

### 6.4 Mã lỗi OTA

| `error` | Nguyên nhân |
|---|---|
| `no_ota_partition` | Thiết bị chưa có bảng phân vùng OTA (xem mục 8) |
| `http_init_failed`, `http_connect_failed` | URL sai hoặc không kết nối được máy chủ |
| `http_status` | Máy chủ trả mã khác 200 |
| `download_failed`, `download_incomplete` | Mất kết nối giữa chừng |
| `too_large` | File lớn hơn khe OTA (1.920 KB) |
| `not_firmware` | File không phải firmware ESP32 |
| `wrong_project` | Firmware của dự án khác |
| `version_mismatch` | `version` trong lệnh khác phiên bản trong file |
| `same_version` | Trùng phiên bản đang chạy và không có `force` |
| `image_invalid` | Checksum ảnh sai, file hỏng |
| `sha256_mismatch` | SHA-256 không khớp |
| `ota_begin_failed`, `flash_write_failed`, `set_boot_failed` | Lỗi ghi flash |
| `no_memory` | Thiếu RAM |
| `new_firmware_not_confirmed` | Đã rollback (xem 6.3) |

### 6.5 Lưu ý vận hành

- Mỗi lúc chỉ chạy được một OTA.
- Telemetry vẫn gửi bình thường trong lúc tải firmware.
- Clean Session = true: nếu máy đang offline thì lệnh `ota` bị mất. Server nên kiểm tra `status` là `{"online":true}` trước khi gửi, và gửi lại nếu không thấy `accepted` trong khoảng 10 giây.
- URL `http://` không mã hóa đường truyền, nhưng SHA-256 bắt buộc đảm bảo file không bị sửa. Nên dùng HTTPS nếu máy chủ có chứng chỉ hợp lệ.

## 7. Dữ liệu lưu trong NVS

OTA chỉ ghi vào khe app còn trống. **Phân vùng NVS không bị đụng tới**, nên toàn bộ cấu hình dưới đây giữ nguyên sau OTA.

Namespace: `zeno_cfg`

| Khóa | Kiểu | Nội dung | Ai ghi |
|---|---|---|---|
| `wifi_ssid` | str | Tên WiFi nhà | Trang cấu hình |
| `wifi_pass` | str | Mật khẩu WiFi | Trang cấu hình |
| `mqtt_client` | str | Client ID (= username MQTT) | Trang cấu hình |
| `mqtt_pass` | str | Mật khẩu MQTT | Trang cấu hình |
| `tele_interval` | u16 | Chu kỳ gửi telemetry (giây) | Lệnh `set_interval` |
| `mqtt_topic` | str | `truliva/devices/<id>`, để tra cứu | Firmware |
| `chip_id` | str | MAC gốc, để tra cứu | Firmware |
| `ap_ssid` | str | Tên WiFi cấu hình `Truliva_xxxxxx` | Firmware |
| `ota_id`, `ota_ver` | str | OTA đang chờ xác nhận; tự xóa sau khi báo kết quả | Firmware |

Không lưu trong NVS (cố định trong firmware, chỉ đổi được bằng OTA): địa chỉ và port broker, keepalive, định dạng topic, mật khẩu WiFi cấu hình `12345678`.

### Quy tắc cho các bản firmware sau

1. **Không đổi** namespace `zeno_cfg`, tên khóa hay kiểu dữ liệu của các khóa trên. Khi cần thêm cấu hình thì thêm khóa mới.
2. Bỏ một khóa thì thêm nó vào danh sách `obsolete_keys` trong `net_config.c`, để firmware tự dọn khi khởi động.
3. **Không đổi bảng phân vùng qua OTA.** OTA không ghi được bảng phân vùng; đổi vị trí NVS sẽ làm mất toàn bộ cấu hình.
4. Khi nâng phiên bản ESP-IDF, phải thử OTA từ bản cũ lên bản mới trên máy thử trước, vì định dạng NVS mới có thể khiến firmware xóa NVS lúc khởi động.

## 8. Lần nạp đầu tiên

Bản 1.2.0 đổi bảng phân vùng từ một app sang hai khe OTA. Vì vậy **mỗi máy phải nạp qua USB một lần** (`pio run -t upload`) trước khi dùng được OTA.

- NVS vẫn ở địa chỉ `0x9000`, dung lượng 24 KB như bản cũ, nên cấu hình WiFi đã lưu không bị mất.
- Cấu hình MQTT cũ (host, port, user, prefix) không còn dùng và được tự xóa. Phải nhập Client ID và mật khẩu mới trên trang cấu hình: giữ nút BOOT 3 giây, vào WiFi `Truliva_xxxxxx` / `12345678`, mở `http://192.168.4.1`.

Bảng phân vùng (flash 4 MB):

| Tên | Địa chỉ | Dung lượng |
|---|---|---|
| nvs | 0x9000 | 24 KB |
| otadata | 0xF000 | 8 KB |
| phy_init | 0x11000 | 4 KB |
| ota_0 | 0x20000 | 1.920 KB |
| ota_1 | 0x200000 | 1.920 KB |

## 9. Thử nhanh bằng mosquitto

```bash
# Theo dõi một máy
mosquitto_sub -h 221.132.21.42 -p 1883 -u <server-user> -P <server-pass> -t 'truliva/devices/<id>/#' -v

# Đổi chu kỳ gửi 10 giây
mosquitto_pub -h 221.132.21.42 -t 'truliva/devices/<id>/command' -q 1 \
  -m '{"cmd":"set_interval","interval":10,"id":"t1"}'

# Khởi động lại
mosquitto_pub -h 221.132.21.42 -t 'truliva/devices/<id>/command' -q 1 -m '{"cmd":"reboot","id":"t2"}'

# OTA
mosquitto_pub -h 221.132.21.42 -t 'truliva/devices/<id>/command' -q 1 \
  -m '{"cmd":"ota","id":"t3","url":"http://<host>/truliva-1.3.0.bin","version":"1.3.0","sha256":"<64 hex>"}'
```
