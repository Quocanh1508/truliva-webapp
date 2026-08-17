# Bàn giao bộ giải mã máy lọc nước

Bên tôi bàn giao cho Quý Đối tác bộ tài liệu và mã nguồn đã hoàn thiện để đọc dữ liệu từ bo máy lọc nước, giải mã TDS và tình trạng ba lõi PPC, RO, CTO.

## Nội dung bàn giao

- `BANG_GIAI_MA_GIAO_THUC_MAY_LOC_NUOC.docx`: đặc tả giao thức, bảng offset, CRC, bảng ngưỡng và test vector.
- `firmware/`: mã nguồn ESP-IDF cho ESP32, gồm UART parser, inline proxy, Telegram và giao diện web nội bộ.
- `README.md`: hướng dẫn cài đặt, đấu nối và vận hành.

## Phần cứng

- ESP32.
- Hai điện trở nối tiếp 1 kΩ cho hai đường DATA.
- Cáp USB cấp nguồn riêng cho ESP32.
- Dây nối GND chung giữa bo máy lọc nước, ESP32 và màn hình.

## Đấu nối

| Kết nối | Chân ESP32 |
|---|---:|
| DATA từ bo chính qua điện trở 1 kΩ | GPIO27 (RX) |
| GPIO26 qua điện trở 1 kΩ tới DATA màn hình | GPIO26 (TX) |
| GND bo chính và GND màn hình | GND |
| Nguồn ESP32 | USB riêng |

Ngắt đường DATA trực tiếp giữa bo chính và màn hình trước khi đặt ESP32 làm proxy inline. Không nối nguồn 5 V của máy lọc vào chân 3V3 hoặc GPIO của ESP32.

## Môi trường build

- ESP-IDF 5.5.x; bản đã xác nhận: ESP-IDF 5.5.5.
- Target: ESP32.
- Console USB: 115200 baud.
- UART dữ liệu: 9600 baud, 8N1, idle HIGH.

## Build và nạp firmware

Mở terminal ESP-IDF, sau đó chạy:

```bash
cd firmware
idf.py set-target esp32
idf.py menuconfig
idf.py build
idf.py -p <CONG_SERIAL> flash monitor
```

Trong `menuconfig`, mở `Water filter network configuration`:

1. Bật `Enable Wi-Fi dashboard and Telegram notifications` nếu sử dụng mạng.
2. Nhập Wi-Fi SSID và mật khẩu.
3. Nhập Telegram bot token, Chat ID và chu kỳ gửi.
4. Lưu cấu hình rồi build.

Không gửi file `sdkconfig` hoặc firmware đã build ra ngoài khi còn thông tin Wi-Fi và Telegram.

## Vận hành

Firmware khởi động ở chế độ `PASS`, chuyển tiếp nguyên trạng dữ liệu từ bo chính tới màn hình.

Các lệnh trên console USB:

```text
status
pass
set ppc 50
set ro 50
set cto 50
set all 50
set tds 100
```

- `status`: xem chế độ hiện tại.
- `pass`: tắt toàn bộ override.
- `set <ppc|ro|cto|all> <0-100>`: đặt giá trị lõi.
- `set tds <0-999>`: đặt giá trị TDS.

Nút BOOT chuyển lần lượt qua các chế độ `PASS`, `PPC`, `RO`, `CTO`, `ALL`; giá trị thử mặc định là 0.

## Dữ liệu đầu ra

Các dòng chính trên console:

- `DECODE`: dữ liệu CSV gồm TDS, PPC, RO, CTO và trạng thái hiển thị.
- `DISPLAY`: dữ liệu đã định dạng để kiểm tra nhanh.
- `PARSER_STATS`: thống kê frame hợp lệ và lỗi parser.
- `PROXY_STATS`: thống kê dữ liệu chuyển tiếp và frame bị thay đổi.

Khi bật Wi-Fi, địa chỉ giao diện web được in trên console sau khi ESP32 nhận IP. Truy cập địa chỉ đó bằng thiết bị trong cùng mạng để xem TDS, tình trạng lõi và lịch sử gần nhất.

## Cấu trúc mã nguồn

| Thành phần | Chức năng |
|---|---|
| `main/tds_sniffer.c` | Khởi tạo hệ thống, xử lý UART, console và dữ liệu giải mã |
| `main/protocol_parser.*` | Ghép frame stream và kiểm tra CRC16 Modbus |
| `main/protocol_proxy.*` | Chuyển tiếp frame và tính lại CRC khi override |
| `main/filter_decode.*` | Quy đổi raw PPC/RO/CTO sang số vạch, màu và nhấp nháy |
| `main/notification.*` | Kết nối Wi-Fi và gửi Telegram |
| `main/notification_format.*` | Tạo nội dung báo cáo Telegram |
| `main/web_dashboard.*` | API HTTP và dữ liệu lịch sử |
| `main/web/dashboard.html` | Giao diện web nhúng trong firmware |

Thông số giao thức và test vector chính thức nằm trong file Word bàn giao.
