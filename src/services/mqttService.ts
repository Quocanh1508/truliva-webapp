import mqtt, { MqttClient } from 'mqtt';
import logger from '../utils/logger';
import prisma from '../config/database';
import { resolveIotModel } from '../config/waterPurifiers';

// ── MQTT Configuration ──
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'truliva_backend';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'TrulivaM0tt@2026';
const TELEMETRY_TOPIC = 'truliva/devices/+/telemetry';
const STATUS_TOPIC = 'truliva/devices/+/status';
const RESPONSE_TOPIC = 'truliva/devices/+/command/response';

// ── Alert Thresholds ──
const ALERT_THRESHOLDS = {
  TDS_HIGH: 50,        // TDS out > 50 → WARNING
  TDS_CRITICAL: 100,   // TDS out > 100 → CRITICAL
  OFFLINE_MINUTES: 30,  // Không gửi data > 30 phút → WARNING
};

// ── Chống "nhấp nháy" cảnh báo ──
// Một loại cảnh báo chỉ có tối đa 1 bản ghi đang mở cho mỗi máy. Sau khi được xử lý (tự động hoặc thủ công),
// cùng loại cảnh báo chỉ được mở lại sau thời gian chờ này — tránh spam khi chỉ số dao động quanh ngưỡng.
const ALERT_REOPEN_COOLDOWN_MS = 15 * 60 * 1000;

// ── Telemetry Storage Throttle Configuration ──
// Tiết chế lưu DB: Chỉ ghi bản ghi mới vào iot_telemetry khi có thay đổi chỉ số
// hoặc định kỳ 2 phút (120 giây) một lần theo yêu cầu quản trị để chống phình to Database
const TELEMETRY_SAVE_THROTTLE_MS = 2 * 60 * 1000; // 2 phút (120.000 ms)

let mqttClient: MqttClient | null = null;

// ── Parse pump status from numeric code ──
function parsePumpStatus(pump: number | string | undefined): string {
  if (pump === undefined || pump === null) return 'UNKNOWN';
  const code = Number(pump);
  switch (code) {
    case 0: return 'OFF';
    case 1: return 'RUNNING';
    case 2: return 'ERROR';
    default: return String(pump);
  }
}

// ── Extract serial number from MQTT topic ──
function extractSerialFromTopic(topic: string): string | null {
  // topic format: truliva/devices/<SERIAL>/...
  const parts = topic.split('/');
  if (parts.length >= 4 && parts[0] === 'truliva' && parts[1] === 'devices') {
    return parts[2];
  }
  return null;
}

// ── Hàng đợi xử lý tuần tự theo từng máy ──
// Các message của cùng 1 serial (telemetry/status/response) được xử lý lần lượt, tránh 2 gói chạy song song
// cùng kiểm tra "chưa có cảnh báo" rồi cùng tạo bản ghi trùng.
const deviceQueues = new Map<string, Promise<void>>();

function enqueueForDevice(serial: string, task: () => Promise<void>): Promise<void> {
  const prev = deviceQueues.get(serial) || Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  deviceQueues.set(serial, next);
  const cleanup = () => {
    if (deviceQueues.get(serial) === next) deviceQueues.delete(serial);
  };
  next.then(cleanup, cleanup);
  return next;
}

// ── Cache thông tin dòng máy từ bảng Serial (tránh query mỗi gói telemetry) ──
const SERIAL_INFO_TTL_MS = 10 * 60 * 1000;
const serialInfoCache = new Map<string, { at: number; info: { model: string | null; productLine: string | null } | null }>();

async function getSerialInfoCached(serialNumber: string) {
  const hit = serialInfoCache.get(serialNumber);
  if (hit && Date.now() - hit.at < SERIAL_INFO_TTL_MS) return hit.info;
  const info = await prisma.serial.findUnique({
    where: { serialNumber },
    select: { model: true, productLine: true }
  }).catch(() => null);
  serialInfoCache.set(serialNumber, { at: Date.now(), info });
  return info;
}

// ── Helpers cảnh báo ──
async function resolveOpenAlerts(deviceId: string, types: string[]) {
  if (types.length === 0) return;
  await prisma.iotAlert.updateMany({
    where: { deviceId, alertType: { in: types }, isResolved: false },
    data: { isResolved: true, resolvedAt: new Date() }
  });
}

/**
 * Mở cảnh báo nếu:
 *  - chưa có cảnh báo cùng loại đang mở cho máy này, và
 *  - không có cảnh báo cùng loại vừa được xử lý trong ALERT_REOPEN_COOLDOWN_MS.
 */
async function raiseAlert(
  deviceId: string,
  serial: string,
  alert: { type: string; severity: string; message: string },
  payload?: any
): Promise<boolean> {
  const open = await prisma.iotAlert.findFirst({
    where: { deviceId, alertType: alert.type, isResolved: false },
    select: { id: true }
  });
  if (open) return false;

  const recentlyResolved = await prisma.iotAlert.findFirst({
    where: {
      deviceId,
      alertType: alert.type,
      isResolved: true,
      resolvedAt: { gte: new Date(Date.now() - ALERT_REOPEN_COOLDOWN_MS) }
    },
    select: { id: true }
  });
  if (recentlyResolved) return false;

  await prisma.iotAlert.create({
    data: {
      deviceId,
      alertType: alert.type,
      severity: alert.severity,
      message: alert.message,
      payload: payload ?? undefined,
    }
  });
  logger.warn('MQTT: Alert created', { serial, type: alert.type, severity: alert.severity });
  return true;
}

// ── Chuẩn hóa các chỉ số từ payload telemetry ──
interface NormalizedTelemetry {
  tdsIn: number | null;
  tdsOut: number | null;
  flow: number | null;
  pressure: number | null;
  pumpStatus: string;
  errorCode: number;
  hasErrorField: boolean;
  filter1Val: number | null;
  filter1Replace: boolean;
  roVal: number | null;
  ctoVal: number | null;
}

function normalizeTelemetry(data: any): NormalizedTelemetry {
  // Map both camelCase (from ESP32 firmware 1.2.0+) and snake_case (legacy)
  const hasErrorField = data.err != null || Array.isArray(data.errorCodes);
  return {
    tdsIn: data.tdsIn != null ? Number(data.tdsIn) : (data.tds_in != null ? Number(data.tds_in) : null),
    tdsOut: data.tdsOut != null ? Number(data.tdsOut) : (data.tds_out != null ? Number(data.tds_out) : null),
    flow: data.flowRate != null ? Number(data.flowRate) : (data.flow != null ? Number(data.flow) : null),
    pressure: data.pressure != null ? Number(data.pressure) : null,
    pumpStatus: data.pumpStatus != null ? String(data.pumpStatus) : parsePumpStatus(data.pump),
    errorCode: data.err != null
      ? Number(data.err)
      : (Array.isArray(data.errorCodes) && data.errorCodes.length > 0 ? Number(data.errorCodes[0]) : 0),
    hasErrorField,
    filter1Val: data.ppc != null ? Number(data.ppc) : (data.pcb != null ? Number(data.pcb) : null),
    filter1Replace: data.ppc_replace === true || data.pcb_replace === true,
    roVal: data.ro != null ? Number(data.ro) : null,
    ctoVal: data.cto != null ? Number(data.cto) : null,
  };
}

// ── Handle telemetry message ──
async function handleTelemetryMessage(topicSerial: string, payload: Buffer) {
  let data: any;
  try {
    data = JSON.parse(payload.toString());
  } catch (e) {
    logger.warn('MQTT: Invalid JSON payload', { serial: topicSerial, raw: payload.toString().substring(0, 200) });
    return;
  }
  if (typeof data !== 'object' || data === null) {
    logger.warn('MQTT: Telemetry payload is not an object', { serial: topicSerial });
    return;
  }

  // Validate serial matches between topic and payload (fallback to topicSerial)
  const payloadSerial = data.sn || data.serialNumber || topicSerial;
  if (payloadSerial !== topicSerial) {
    logger.warn('MQTT: Serial mismatch between topic and payload', {
      topicSerial,
      payloadSerial
    });
    return;
  }

  try {
    const nowDate = new Date();
    const firmwareVer = data.fw || null;

    // 1. Find or create IoT device
    let device = await prisma.iotDevice.findUnique({
      where: { serialNumber: topicSerial }
    });

    if (!device) {
      // Auto-register new device
      device = await prisma.iotDevice.create({
        data: {
          serialNumber: topicSerial,
          mqttUsername: topicSerial,
          firmwareVersion: firmwareVer,
          lastSeenAt: nowDate,
          isOnline: true,
          latestPayload: data,
          latestPayloadAt: nowDate,
        }
      });
      logger.info('MQTT: Auto-registered new IoT device', { serial: topicSerial, fw: firmwareVer });
    } else if (device.isArchived) {
      // Máy đã lưu trữ: bỏ qua hoàn toàn (không cập nhật online, không lưu lịch sử, không cảnh báo)
      logger.debug('MQTT: Ignoring telemetry from archived device', { serial: topicSerial });
      return;
    } else {
      // Chỉ cập nhật các cột liên quan — KHÔNG ghi đè configJson (tránh làm mất cấu hình do admin thay đổi song song)
      await prisma.iotDevice.update({
        where: { id: device.id },
        data: {
          lastSeenAt: nowDate,
          isOnline: true,
          firmwareVersion: firmwareVer || device.firmwareVersion,
          latestPayload: data,
          latestPayloadAt: nowDate,
        }
      });
    }

    const t = normalizeTelemetry(data);

    // 1b. Xác minh lệnh gần nhất bằng dữ liệu thật từ chip (uptime / interval / gói tin mới)
    await verifyLastCommand(device.id, topicSerial, device.configJson, data, nowDate);

    // 2. Auto-resolve self-healing alerts
    await autoResolveAlerts(device.id, topicSerial, data, t);

    // 3. Store telemetry data with intelligent throttle (chỉ lưu DB khi chỉ số đổi hoặc định kỳ 2 phút/lần)
    const now = Date.now();
    const lastSaved = lastTelemetrySaveMap.get(device.id);
    const hasChanged = !lastSaved ||
      lastSaved.tdsOut !== t.tdsOut ||
      lastSaved.ppc !== t.filter1Val ||
      lastSaved.ro !== t.roVal ||
      lastSaved.cto !== t.ctoVal ||
      lastSaved.errorCode !== t.errorCode ||
      (now - lastSaved.time >= TELEMETRY_SAVE_THROTTLE_MS); // Lưu định kỳ 2 phút/lần (120 giây) nếu chỉ số không đổi

    if (hasChanged) {
      await prisma.iotTelemetry.create({
        data: {
          deviceId: device.id,
          tdsIn: t.tdsIn,
          tdsOut: t.tdsOut,
          waterFlowLpm: t.flow,
          totalLiters: data.total_l != null ? Number(data.total_l) : null,
          waterPressure: t.pressure,
          pumpStatus: t.pumpStatus !== 'UNKNOWN' ? t.pumpStatus : null,
          errorCode: t.errorCode,
          rawPayload: data,
          recordedAt: data.ts ? new Date(data.ts * 1000) : nowDate,
        }
      });

      lastTelemetrySaveMap.set(device.id, {
        time: now,
        tdsOut: t.tdsOut,
        ppc: t.filter1Val,
        ro: t.roVal,
        cto: t.ctoVal,
        errorCode: t.errorCode
      });
      logger.debug('MQTT: Telemetry stored', { serial: topicSerial, tdsIn: t.tdsIn, tdsOut: t.tdsOut, ppc: t.filter1Val, ro: t.roVal, cto: t.ctoVal });
    }

    // 4. Check alert thresholds
    await checkAlerts(device.id, topicSerial, data, t, device.isMuted);
  } catch (error: any) {
    logger.error('MQTT: Error processing telemetry', {
      serial: topicSerial,
      error: error.message
    });
  }
}

// ── Xác minh lệnh đã thực sự tác động lên chip ──
// Phản hồi "ok" chỉ chứng tỏ firmware NHẬN lệnh. Ở đây đối chiếu với telemetry sau đó:
//  - reboot: thời điểm khởi động (now - uptime) nằm SAU lúc gửi lệnh → chip đã khởi động lại thật
//  - set_interval: telemetry báo đúng interval mới
//  - ping: có gói telemetry tới trong 60 giây sau khi gửi lệnh
const COMMAND_VERIFY_WINDOW_MS = 60 * 60 * 1000; // Sau 1 giờ không còn đối chiếu (tránh nhận nhầm)
const REBOOT_CLOCK_TOLERANCE_MS = 5000;

async function verifyLastCommand(deviceId: string, serial: string, configJson: any, data: any, now: Date) {
  try {
    const lc = configJson?.lastCommand;
    if (!lc?.id || lc.verified || !lc.sentAt) return;
    if (!['sent', 'acknowledged'].includes(lc.status)) return;
    const sentAt = new Date(lc.sentAt).getTime();
    const elapsed = now.getTime() - sentAt;
    if (elapsed < 0 || elapsed > COMMAND_VERIFY_WINDOW_MS) return;

    let evidence: Record<string, any> | null = null;
    if (lc.cmd === 'reboot' && data.uptime != null) {
      const bootAt = now.getTime() - Number(data.uptime) * 1000;
      if (bootAt >= sentAt - REBOOT_CLOCK_TOLERANCE_MS) {
        evidence = {
          bootAt: new Date(bootAt).toISOString(),
          uptime: Number(data.uptime),
          resetReason: data.reset_reason ?? null,
          firstTelemetryAfterSec: Math.round(elapsed / 1000),
        };
      }
    } else if (lc.cmd === 'set_interval' && data.interval != null && Number(data.interval) === Number(lc.params?.interval)) {
      evidence = { interval: Number(data.interval) };
    } else if (lc.cmd === 'ping' && elapsed <= 60_000) {
      evidence = { telemetryAfterSec: Math.round(elapsed / 1000) };
    }
    if (!evidence) return;

    await updateLastCommand(deviceId, lc.id, { verified: true, verifiedAt: now.toISOString(), evidence });
    logger.info('MQTT: Command effect verified on device', { serial, cmd: lc.cmd, requestId: lc.id, evidence });
  } catch (err: any) {
    logger.warn('MQTT: Verify last command error', { serial, error: err.message });
  }
}

// ── In-memory throttle tracker for telemetry ──
const lastTelemetrySaveMap = new Map<string, { time: number; tdsOut: number | null; ppc: number | null; ro: number | null; cto: number | null; errorCode: number }>();

// ── Auto-resolve self-healing alerts ──
async function autoResolveAlerts(deviceId: string, serial: string, data: any, t: NormalizedTelemetry) {
  try {
    const toResolve: string[] = [];

    // 1. Máy gửi telemetry → đã online trở lại
    toResolve.push('OFFLINE');

    // 2. UART kết nối lại bình thường
    if (data.uart_ok === true) toResolve.push('UART_ERROR');

    // 3. TDS về vùng an toàn (<= 50)
    if (t.tdsOut !== null && t.tdsOut <= ALERT_THRESHOLDS.TDS_HIGH) {
      toResolve.push('TDS_HIGH', 'TDS_CRITICAL');
    }

    // 4. Lõi lọc đã thay (hỗ trợ cả chuẩn 3 lõi PPC/PGP và 2 lõi PCB)
    if (!t.filter1Replace && (t.filter1Val === null || t.filter1Val >= 10)) {
      toResolve.push('FILTER_PPC_REPLACE', 'FILTER_PCB_REPLACE');
    }
    if (data.ro_replace === false || (data.ro_replace !== true && (t.roVal === null || t.roVal >= 10))) {
      toResolve.push('FILTER_RO_REPLACE');
    }
    if (data.cto_replace === false || (data.cto_replace !== true && (t.ctoVal === null || t.ctoVal >= 10))) {
      toResolve.push('FILTER_CTO_REPLACE');
    }

    // 5. Bơm hoạt động bình thường trở lại (chỉ khi biết rõ trạng thái bơm)
    if (t.pumpStatus === 'OFF' || t.pumpStatus === 'RUNNING') {
      toResolve.push('PUMP_ERROR');
    }

    // 6. Máy báo hết mã lỗi (chỉ khi payload có trường err/errorCodes)
    if (t.hasErrorField && t.errorCode === 0) {
      toResolve.push('DEVICE_ERROR');
    }

    await resolveOpenAlerts(deviceId, toResolve);
  } catch (err: any) {
    logger.warn('MQTT: Auto-resolve alerts error', { serial, error: err.message });
  }
}

// ── Check alert conditions ──
async function checkAlerts(
  deviceId: string,
  serial: string,
  data: any,
  t: NormalizedTelemetry,
  isMuted?: boolean
) {
  if (isMuted) {
    logger.debug('MQTT: Device alerts muted, skipping alert creation', { serial });
    return;
  }

  const alerts: { type: string; severity: string; message: string }[] = [];
  const { tdsOut, filter1Val, filter1Replace, roVal, ctoVal } = t;

  // TDS Critical
  if (tdsOut !== null && tdsOut > ALERT_THRESHOLDS.TDS_CRITICAL) {
    alerts.push({
      type: 'TDS_CRITICAL',
      severity: 'CRITICAL',
      message: `⚠️ TDS đầu ra cực cao: ${tdsOut} ppm (Máy ${serial}). Kiểm tra lõi lọc RO ngay!`
    });
  }
  // TDS High
  else if (tdsOut !== null && tdsOut > ALERT_THRESHOLDS.TDS_HIGH) {
    alerts.push({
      type: 'TDS_HIGH',
      severity: 'WARNING',
      message: `⚠️ TDS đầu ra cao: ${tdsOut} ppm (Máy ${serial}). Nên kiểm tra lõi lọc.`
    });
  }

  // ── Xử lý thông báo lõi lọc theo cấu hình dòng máy (2 lõi UR61096H vs 3 lõi UR5676/UR5840) ──
  // Dùng chung resolveIotModel với API/frontend để tên lõi & loại cảnh báo luôn khớp với màn hình
  const modelInfo = resolveIotModel(await getSerialInfoCached(serial), serial, data);
  const is2FilterModel = modelInfo.filterCount === 2;

  if (is2FilterModel) {
    // ── Dòng 2 lõi (UR61096H): Lõi 1 (PCB) & Lõi 2 (RO) ──
    // Quy chuẩn chỉ báo: < 10% hoặc flag replace -> Nháy đèn đỏ -> Cần thay
    if (filter1Replace || (filter1Val !== null && filter1Val < 10)) {
      alerts.push({
        type: 'FILTER_PCB_REPLACE',
        severity: 'WARNING',
        message: `⚠️ Máy ${serial}: Lõi lọc PCB đã hết hạn (${filter1Val ?? 0}% - Nháy đèn đỏ). Cần thay lõi!`
      });
    }

    if (data.ro_replace === true || (roVal !== null && roVal < 10)) {
      alerts.push({
        type: 'FILTER_RO_REPLACE',
        severity: 'CRITICAL',
        message: `⚠️ Máy ${serial}: Màng lọc RO đã hết hạn (${roVal ?? 0}% - Nháy đèn đỏ). Cần thay màng RO!`
      });
    }
    // Dòng 2 lõi không có Lõi 3 (CTO), không phát cảnh báo CTO
  } else {
    // ── Dòng 3 lõi (UR5676, UR5840): Lõi 1 (PGP), Lõi 2 (RO), Lõi 3 (CTO) ──
    // Quy chuẩn chỉ báo: < 10% hoặc flag replace -> 1 vạch nháy đỏ -> Cần thay
    if (filter1Replace || (filter1Val !== null && filter1Val < 10)) {
      alerts.push({
        type: 'FILTER_PPC_REPLACE',
        severity: 'WARNING',
        message: `⚠️ Máy ${serial}: Lõi lọc PGP đã hết hạn (${filter1Val ?? 0}% - 1 vạch nháy đỏ). Cần thay lõi PGP!`
      });
    }

    if (data.ro_replace === true || (roVal !== null && roVal < 10)) {
      alerts.push({
        type: 'FILTER_RO_REPLACE',
        severity: 'CRITICAL',
        message: `⚠️ Máy ${serial}: Màng lọc RO đã hết hạn (${roVal ?? 0}% - 1 vạch nháy đỏ). Cần thay màng RO!`
      });
    }

    if (data.cto_replace === true || (ctoVal !== null && ctoVal < 10)) {
      alerts.push({
        type: 'FILTER_CTO_REPLACE',
        severity: 'WARNING',
        message: `⚠️ Máy ${serial}: Lõi than CTO đã hết hạn (${ctoVal ?? 0}% - 1 vạch nháy đỏ). Cần thay lõi CTO!`
      });
    }
  }

  // UART connection lost between ESP32 and Water Purifier mainboard
  if (data.uart_ok === false) {
    alerts.push({
      type: 'UART_ERROR',
      severity: 'WARNING',
      message: `⚠️ Máy ${serial}: Mất kết nối UART giữa ESP32 và bo điều khiển máy lọc.`
    });
  }

  // Pump Error
  if (t.pumpStatus === 'ERROR') {
    alerts.push({
      type: 'PUMP_ERROR',
      severity: 'CRITICAL',
      message: `🔴 Lỗi bơm trên máy ${serial}. Cần kiểm tra phần cứng!`
    });
  }

  // Error code from device
  if (t.errorCode > 0) {
    alerts.push({
      type: 'DEVICE_ERROR',
      severity: 'WARNING',
      message: `⚠️ Máy ${serial} báo lỗi code: ${t.errorCode}`
    });
  }

  // Mỗi loại cảnh báo chỉ có tối đa 1 bản ghi đang mở (xem raiseAlert)
  for (const alert of alerts) {
    await raiseAlert(deviceId, serial, alert, data);
  }
}

// ── Handle device status (LWT) ──
async function handleStatusMessage(serial: string, payload: Buffer) {
  try {
    const data = JSON.parse(payload.toString());
    const isOnline = data?.online === true;

    const device = await prisma.iotDevice.findUnique({
      where: { serialNumber: serial }
    });
    if (!device) return;
    if (device.isArchived) {
      logger.debug('MQTT: Ignoring status from archived device', { serial });
      return;
    }

    await prisma.iotDevice.update({
      where: { id: device.id },
      data: { isOnline }
    });

    if (!isOnline) {
      if (device.isMuted) {
        logger.debug('MQTT: Device is muted, skipping offline alert', { serial });
      } else {
        await raiseAlert(device.id, serial, {
          type: 'OFFLINE',
          severity: 'WARNING',
          message: `📡 Máy ${serial} đã mất kết nối.`,
        });
      }
    }

    logger.info('MQTT: Device status changed', { serial, online: isOnline });
  } catch (e: any) {
    logger.warn('MQTT: Invalid status payload', { serial, error: e.message });
  }
}

// ── Gộp patch vào configJson một cách nguyên tử (jsonb ||), không ghi đè các key khác ──
async function mergeDeviceConfig(deviceId: string, patch: Record<string, any>) {
  await prisma.$executeRaw`
    UPDATE iot_devices
    SET config_json = COALESCE(config_json, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
        updated_at = NOW()
    WHERE id = ${deviceId}
  `;
}

// ── Handle command response from device (OTA, ping, set_interval, reboot) ──
async function handleCommandResponse(serial: string, payload: Buffer) {
  try {
    const data = JSON.parse(payload.toString());
    logger.info('MQTT: Command response received', { serial, data });

    const device = await prisma.iotDevice.findUnique({
      where: { serialNumber: serial }
    });
    if (!device || device.isArchived) return;

    const patch: Record<string, any> = {
      lastCommandResponse: data,
      lastCommandResponseAt: new Date().toISOString()
    };

    // Process OTA command response
    if (data.cmd === 'ota') {
      patch.otaStatus = data.status;
      patch.otaProgress = data.progress ?? 0;
      if (data.version) patch.otaVersion = data.version;

      // When OTA successfully completed, update firmware version in DB
      if (data.status === 'completed' && data.version) {
        await prisma.iotDevice.update({
          where: { id: device.id },
          data: { firmwareVersion: data.version }
        });
        logger.info(`MQTT: Device ${serial} upgraded firmware to ${data.version} successfully`);
      }

      // If OTA rolled back (sự kiện rời rạc — mỗi lần rollback ghi 1 cảnh báo)
      if (data.status === 'rolled_back' && !device.isMuted) {
        await prisma.iotAlert.create({
          data: {
            deviceId: device.id,
            alertType: 'OTA_ROLLBACK',
            severity: 'WARNING',
            message: `⚠️ Máy ${serial} đã tự động rollback về firmware cũ (${data.error || 'chưa rõ lý do'})`,
            payload: data
          }
        });
      }
    }

    // Process set_interval response
    if (data.cmd === 'set_interval' && data.ok && data.interval) {
      patch.interval = data.interval;
    }

    await mergeDeviceConfig(device.id, patch);

    // Khớp phản hồi với lệnh gần nhất (theo id) → cập nhật trạng thái lệnh cho UI
    if (data.id) {
      const isOtaProgress = data.cmd === 'ota' && data.ok !== false && !['completed', 'rolled_back', 'failed'].includes(data.status);
      const status = data.ok === false || data.status === 'failed' || data.status === 'rolled_back'
        ? 'failed'
        : (isOtaProgress ? 'in_progress' : 'acknowledged');
      await updateLastCommand(device.id, String(data.id), {
        status,
        error: data.error || null,
        response: data,
        respondedAt: new Date().toISOString()
      });
    }
  } catch (err: any) {
    logger.warn('MQTT: Invalid command response payload', { serial, error: err.message });
  }
}

// ── Trạng thái lệnh gần nhất (configJson.lastCommand) ──
// Cập nhật CÓ ĐIỀU KIỆN theo id: phản hồi của lệnh cũ không ghi đè lên lệnh mới hơn.
async function updateLastCommand(deviceId: string, requestId: string, patch: Record<string, any>) {
  await prisma.$executeRaw`
    UPDATE iot_devices
    SET config_json = jsonb_set(config_json, '{lastCommand}', (config_json->'lastCommand') || ${JSON.stringify(patch)}::jsonb),
        updated_at = NOW()
    WHERE id = ${deviceId} AND config_json->'lastCommand'->>'id' = ${requestId}
  `;
}

export const SUPPORTED_COMMANDS = ['set_interval', 'ping', 'reboot', 'ota'] as const;
export type DeviceCommand = typeof SUPPORTED_COMMANDS[number];
export const MAX_COMMAND_BYTES = 767; // Giới hạn kích thước lệnh theo spec đối tác
const PUBLISH_ACK_TIMEOUT_MS = 5000;

export type PublishResult =
  | { ok: true; requestId: string }
  | { ok: false; reason: 'not_connected' | 'too_long' | 'publish_failed' | 'timeout'; error?: string };

/**
 * Gửi lệnh xuống thiết bị. `params` phải là tham số ĐÃ ĐƯỢC KIỂM TRA (xem routes/iot.ts).
 * Chờ broker xác nhận QoS 1 (PUBACK) trước khi trả kết quả, đồng thời lưu lệnh vào configJson.lastCommand
 * để đối chiếu với phản hồi từ thiết bị.
 */
export async function publishCommand(
  device: { id: string; serialNumber: string },
  command: DeviceCommand,
  params: Record<string, any> = {},
  sentBy?: string
): Promise<PublishResult> {
  if (!mqttClient || !mqttClient.connected) {
    logger.error('MQTT: Client not connected, cannot publish command');
    return { ok: false, reason: 'not_connected' };
  }

  const topic = `truliva/devices/${device.serialNumber}/command`;
  const requestId = `req-${Date.now()}`;

  // Flatten payload per partner specification: {"cmd": "<tên lệnh>", "id": "<mã yêu cầu>", ...tham số}
  const payloadObj: Record<string, any> = { cmd: command, id: requestId, ...params };
  if (command === 'set_interval') payloadObj.interval_s = params.interval; // Tương thích firmware cũ (field thừa bị bỏ qua)
  const payload = JSON.stringify(payloadObj);
  if (Buffer.byteLength(payload) > MAX_COMMAND_BYTES) {
    return { ok: false, reason: 'too_long' };
  }

  // Ghi lệnh TRƯỚC khi publish để phản hồi (có thể về rất nhanh) luôn tìm thấy lệnh tương ứng
  await mergeDeviceConfig(device.id, {
    lastCommand: { id: requestId, cmd: command, params, status: 'sent', sentAt: new Date().toISOString(), sentBy: sentBy || null }
  });

  const client = mqttClient;
  const result = await new Promise<PublishResult>((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), PUBLISH_ACK_TIMEOUT_MS);
    // QoS 1, retain: false per specification (device ignores retained commands)
    client.publish(topic, payload, { qos: 1, retain: false }, (err) => {
      clearTimeout(timer);
      resolve(err ? { ok: false, reason: 'publish_failed', error: err.message } : { ok: true, requestId });
    });
  });

  if (result.ok) {
    logger.info('MQTT: Command published', { serial: device.serialNumber, command, requestId, payload });
  } else {
    logger.error('MQTT: Failed to publish command', { serial: device.serialNumber, command, reason: result.reason, error: result.error });
    await updateLastCommand(device.id, requestId, { status: 'publish_failed', error: result.error || result.reason });
  }
  return result;
}

// ── Offline detection scheduler ──
let offlineCheckInterval: NodeJS.Timeout | null = null;

async function checkOfflineDevices() {
  try {
    const threshold = new Date(Date.now() - ALERT_THRESHOLDS.OFFLINE_MINUTES * 60 * 1000);

    // Find devices that were online but haven't sent data recently (bỏ qua máy đã lưu trữ)
    const staleDevices = await prisma.iotDevice.findMany({
      where: {
        isArchived: false,
        isOnline: true,
        lastSeenAt: { lt: threshold }
      }
    });

    for (const device of staleDevices) {
      await enqueueForDevice(device.serialNumber, async () => {
        // Cập nhật có điều kiện: nếu telemetry vừa tới (lastSeenAt mới) thì không đánh offline nữa
        const result = await prisma.iotDevice.updateMany({
          where: { id: device.id, isOnline: true, lastSeenAt: { lt: threshold } },
          data: { isOnline: false }
        });
        if (result.count === 0 || device.isMuted) return;

        const created = await raiseAlert(device.id, device.serialNumber, {
          type: 'OFFLINE',
          severity: 'WARNING',
          message: `📡 Máy ${device.serialNumber} mất kết nối (không gửi dữ liệu > ${ALERT_THRESHOLDS.OFFLINE_MINUTES} phút).`,
        });
        if (created) logger.warn('MQTT: Device marked offline', { serial: device.serialNumber });
      });
    }
  } catch (error: any) {
    logger.error('MQTT: Offline check error', { error: error.message });
  }
}

// ── Initialize MQTT connection ──
export function startMqttService() {
  logger.info('MQTT: Connecting to broker...', { url: MQTT_BROKER_URL });

  mqttClient = mqtt.connect(MQTT_BROKER_URL, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clientId: 'truliva_backend_' + Date.now(),
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  mqttClient.on('connect', () => {
    logger.info('MQTT: Connected to broker successfully');

    // Subscribe to telemetry, status, and command response topics
    mqttClient!.subscribe(TELEMETRY_TOPIC, { qos: 1 }, (err) => {
      if (err) {
        logger.error('MQTT: Failed to subscribe to telemetry', { error: err.message });
      } else {
        logger.info('MQTT: Subscribed to', { topic: TELEMETRY_TOPIC });
      }
    });

    mqttClient!.subscribe(STATUS_TOPIC, { qos: 1 }, (err) => {
      if (err) {
        logger.error('MQTT: Failed to subscribe to status', { error: err.message });
      } else {
        logger.info('MQTT: Subscribed to', { topic: STATUS_TOPIC });
      }
    });

    mqttClient!.subscribe(RESPONSE_TOPIC, { qos: 1 }, (err) => {
      if (err) {
        logger.error('MQTT: Failed to subscribe to command response', { error: err.message });
      } else {
        logger.info('MQTT: Subscribed to', { topic: RESPONSE_TOPIC });
      }
    });
  });

  mqttClient.on('message', (topic: string, payload: Buffer) => {
    const serial = extractSerialFromTopic(topic);
    if (!serial) {
      logger.warn('MQTT: Could not extract serial from topic', { topic });
      return;
    }

    let handler: ((serial: string, payload: Buffer) => Promise<void>) | null = null;
    let label = '';
    if (topic.endsWith('/telemetry')) {
      handler = handleTelemetryMessage; label = 'telemetry';
    } else if (topic.endsWith('/status')) {
      handler = handleStatusMessage; label = 'status';
    } else if (topic.endsWith('/command/response')) {
      handler = handleCommandResponse; label = 'command response';
    }
    if (!handler) return;

    const run = handler;
    enqueueForDevice(serial, () => run(serial, payload)).catch(err => {
      logger.error(`MQTT: Unhandled error in ${label} handler`, { serial, error: err.message });
    });
  });

  mqttClient.on('error', (err) => {
    logger.error('MQTT: Connection error', { error: err.message });
  });

  mqttClient.on('reconnect', () => {
    logger.info('MQTT: Reconnecting to broker...');
  });

  mqttClient.on('offline', () => {
    logger.warn('MQTT: Client went offline');
  });

  // Start offline device checker (every 5 minutes)
  offlineCheckInterval = setInterval(checkOfflineDevices, 5 * 60 * 1000);

  logger.info('MQTT: Service initialized');
}

export function stopMqttService() {
  if (mqttClient) {
    mqttClient.end();
    mqttClient = null;
  }
  if (offlineCheckInterval) {
    clearInterval(offlineCheckInterval);
    offlineCheckInterval = null;
  }
  logger.info('MQTT: Service stopped');
}
