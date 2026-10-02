import mqtt, { MqttClient } from 'mqtt';
import logger from '../utils/logger';
import prisma from '../config/database';

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

// ── Handle telemetry message ──
async function handleTelemetryMessage(topic: string, payload: Buffer) {
  const topicSerial = extractSerialFromTopic(topic);
  if (!topicSerial) {
    logger.warn('MQTT: Could not extract serial from topic', { topic });
    return;
  }

  let data: any;
  try {
    data = JSON.parse(payload.toString());
  } catch (e) {
    logger.warn('MQTT: Invalid JSON payload', { topic, raw: payload.toString().substring(0, 200) });
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
    // 1. Find or create IoT device
    let device = await prisma.iotDevice.findUnique({
      where: { serialNumber: topicSerial }
    });

    const firmwareVer = data.fw || null;

    if (!device) {
      // Auto-register new device
      device = await prisma.iotDevice.create({
        data: {
          serialNumber: topicSerial,
          mqttUsername: topicSerial,
          firmwareVersion: firmwareVer,
          lastSeenAt: new Date(),
          isOnline: true,
        }
      });
      logger.info('MQTT: Auto-registered new IoT device', { serial: topicSerial, fw: firmwareVer });
    } else {
      // Update device status
      await prisma.iotDevice.update({
        where: { id: device.id },
        data: {
          lastSeenAt: new Date(),
          isOnline: true,
          firmwareVersion: firmwareVer || device.firmwareVersion,
        }
      });
    }

    // 2. Store telemetry data
    // Map both camelCase (from ESP32 firmware 1.2.0+) and snake_case (legacy)
    const tdsIn = data.tdsIn != null ? Number(data.tdsIn) : (data.tds_in != null ? Number(data.tds_in) : null);
    const tdsOut = data.tdsOut != null ? Number(data.tdsOut) : (data.tds_out != null ? Number(data.tds_out) : null);
    const flow = data.flowRate != null ? Number(data.flowRate) : (data.flow != null ? Number(data.flow) : null);
    const pressure = data.pressure != null ? Number(data.pressure) : null;
    const pumpStatus = data.pumpStatus != null ? String(data.pumpStatus) : parsePumpStatus(data.pump);
    const errorCode = data.err != null
      ? Number(data.err)
      : (Array.isArray(data.errorCodes) && data.errorCodes.length > 0 ? Number(data.errorCodes[0]) : 0);

    await prisma.iotTelemetry.create({
      data: {
        deviceId: device.id,
        tdsIn,
        tdsOut,
        waterFlowLpm: flow,
        totalLiters: data.total_l != null ? Number(data.total_l) : null,
        waterPressure: pressure,
        pumpStatus: pumpStatus !== 'UNKNOWN' ? pumpStatus : null,
        errorCode,
        rawPayload: data,
        recordedAt: data.ts ? new Date(data.ts * 1000) : new Date(),
      }
    });

    // 3. Check alert thresholds
    await checkAlerts(device.id, topicSerial, data, pumpStatus, tdsOut);

    logger.debug('MQTT: Telemetry stored', { serial: topicSerial, tdsIn, tdsOut, ppc: data.ppc, ro: data.ro, cto: data.cto });
  } catch (error: any) {
    logger.error('MQTT: Error processing telemetry', {
      serial: topicSerial,
      error: error.message
    });
  }
}

// ── Check alert conditions ──
async function checkAlerts(
  deviceId: string,
  serial: string,
  data: any,
  pumpStatus: string,
  tdsOut: number | null
) {
  const alerts: { type: string; severity: string; message: string }[] = [];

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

  // Filter 1: PPC replacement alert
  if (data.ppc_replace === true) {
    alerts.push({
      type: 'FILTER_PPC_REPLACE',
      severity: 'WARNING',
      message: `⚠️ Máy ${serial}: Lõi lọc thô PPC đã hết hạn (${data.ppc ?? 0}%). Cần thay lõi!`
    });
  }

  // Filter 2: RO membrane replacement alert
  if (data.ro_replace === true) {
    alerts.push({
      type: 'FILTER_RO_REPLACE',
      severity: 'CRITICAL',
      message: `⚠️ Máy ${serial}: Màng lọc RO đã hết hạn (${data.ro ?? 0}%). Cần thay màng RO!`
    });
  }

  // Filter 3: CTO carbon replacement alert
  if (data.cto_replace === true) {
    alerts.push({
      type: 'FILTER_CTO_REPLACE',
      severity: 'WARNING',
      message: `⚠️ Máy ${serial}: Lõi than CTO đã hết hạn (${data.cto ?? 0}%). Cần thay lõi CTO!`
    });
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
  if (pumpStatus === 'ERROR') {
    alerts.push({
      type: 'PUMP_ERROR',
      severity: 'CRITICAL',
      message: `🔴 Lỗi bơm trên máy ${serial}. Cần kiểm tra phần cứng!`
    });
  }

  // Error code from device
  if (data.err && Number(data.err) > 0) {
    alerts.push({
      type: 'DEVICE_ERROR',
      severity: 'WARNING',
      message: `⚠️ Máy ${serial} báo lỗi code: ${data.err}`
    });
  }

  // Create alerts (avoid duplicates within 1 hour)
  for (const alert of alerts) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existingAlert = await prisma.iotAlert.findFirst({
      where: {
        deviceId,
        alertType: alert.type,
        isResolved: false,
        createdAt: { gte: oneHourAgo }
      }
    });

    if (!existingAlert) {
      await prisma.iotAlert.create({
        data: {
          deviceId,
          alertType: alert.type,
          severity: alert.severity,
          message: alert.message,
          payload: data,
        }
      });
      logger.warn('MQTT: Alert created', { serial, type: alert.type, severity: alert.severity });
    }
  }
}

// ── Handle device status (LWT) ──
async function handleStatusMessage(topic: string, payload: Buffer) {
  const serial = extractSerialFromTopic(topic);
  if (!serial) return;

  try {
    const data = JSON.parse(payload.toString());
    const isOnline = data.online === true;

    await prisma.iotDevice.updateMany({
      where: { serialNumber: serial },
      data: { isOnline }
    });

    if (!isOnline) {
      // Device went offline — create alert
      const device = await prisma.iotDevice.findUnique({
        where: { serialNumber: serial }
      });
      if (device) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const existing = await prisma.iotAlert.findFirst({
          where: {
            deviceId: device.id,
            alertType: 'OFFLINE',
            isResolved: false,
            createdAt: { gte: oneHourAgo }
          }
        });
        if (!existing) {
          await prisma.iotAlert.create({
            data: {
              deviceId: device.id,
              alertType: 'OFFLINE',
              severity: 'WARNING',
              message: `📡 Máy ${serial} đã mất kết nối.`,
            }
          });
        }
      }
    }

    logger.info('MQTT: Device status changed', { serial, online: isOnline });
  } catch (e: any) {
    logger.warn('MQTT: Invalid status payload', { topic, error: e.message });
  }
}

// ── Handle command response from device (OTA, ping, set_interval, reboot) ──
async function handleCommandResponse(topic: string, payload: Buffer) {
  const serial = extractSerialFromTopic(topic);
  if (!serial) return;

  try {
    const data = JSON.parse(payload.toString());
    logger.info('MQTT: Command response received', { serial, data });

    const device = await prisma.iotDevice.findUnique({
      where: { serialNumber: serial }
    });
    if (!device) return;

    const currentConfig = (typeof device.configJson === 'object' && device.configJson !== null)
      ? (device.configJson as Record<string, any>)
      : {};

    const updatedConfig: Record<string, any> = {
      ...currentConfig,
      lastCommandResponse: data,
      lastCommandResponseAt: new Date().toISOString()
    };

    // Process OTA command response
    if (data.cmd === 'ota') {
      updatedConfig.otaStatus = data.status;
      updatedConfig.otaProgress = data.progress ?? 0;
      if (data.version) updatedConfig.otaVersion = data.version;

      // When OTA successfully completed, update firmware version in DB
      if (data.status === 'completed' && data.version) {
        await prisma.iotDevice.update({
          where: { id: device.id },
          data: {
            firmwareVersion: data.version,
            configJson: updatedConfig
          }
        });
        logger.info(`MQTT: Device ${serial} upgraded firmware to ${data.version} successfully`);
        return;
      }

      // If OTA rolled back
      if (data.status === 'rolled_back') {
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
      updatedConfig.interval = data.interval;
    }

    await prisma.iotDevice.update({
      where: { id: device.id },
      data: { configJson: updatedConfig }
    });
  } catch (err: any) {
    logger.warn('MQTT: Invalid command response payload', { topic, error: err.message });
  }
}

// ── Publish command to device ──
export function publishCommand(serialNumber: string, command: string, params: any = {}) {
  if (!mqttClient || !mqttClient.connected) {
    logger.error('MQTT: Client not connected, cannot publish command');
    return false;
  }

  const topic = `truliva/devices/${serialNumber}/command`;
  const requestId = params.id || `req-${Date.now()}`;

  // Flatten payload per partner specification:
  // {"cmd": "<tên lệnh>", "id": "<mã yêu cầu, tùy chọn>", ...tham số}
  const payloadObj: any = {
    cmd: command,
    id: requestId,
    ...params
  };

  const payload = JSON.stringify(payloadObj);

  // QoS 1, retain: false per specification (device ignores retained commands)
  mqttClient.publish(topic, payload, { qos: 1, retain: false }, (err) => {
    if (err) {
      logger.error('MQTT: Failed to publish command', { serial: serialNumber, error: err.message });
    } else {
      logger.info('MQTT: Command published', { serial: serialNumber, command, requestId });
    }
  });
  return true;
}

// ── Offline detection scheduler ──
let offlineCheckInterval: NodeJS.Timeout | null = null;

async function checkOfflineDevices() {
  try {
    const threshold = new Date(Date.now() - ALERT_THRESHOLDS.OFFLINE_MINUTES * 60 * 1000);

    // Find devices that were online but haven't sent data recently
    const staleDevices = await prisma.iotDevice.findMany({
      where: {
        isOnline: true,
        lastSeenAt: { lt: threshold }
      }
    });

    for (const device of staleDevices) {
      await prisma.iotDevice.update({
        where: { id: device.id },
        data: { isOnline: false }
      });

      // Create offline alert if not already exists
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const existing = await prisma.iotAlert.findFirst({
        where: {
          deviceId: device.id,
          alertType: 'OFFLINE',
          isResolved: false,
          createdAt: { gte: oneHourAgo }
        }
      });

      if (!existing) {
        await prisma.iotAlert.create({
          data: {
            deviceId: device.id,
            alertType: 'OFFLINE',
            severity: 'WARNING',
            message: `📡 Máy ${device.serialNumber} mất kết nối (không gửi dữ liệu > ${ALERT_THRESHOLDS.OFFLINE_MINUTES} phút).`,
          }
        });
        logger.warn('MQTT: Device marked offline', { serial: device.serialNumber });
      }
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
    if (topic.endsWith('/telemetry')) {
      handleTelemetryMessage(topic, payload).catch(err => {
        logger.error('MQTT: Unhandled error in telemetry handler', { error: err.message });
      });
    } else if (topic.endsWith('/status')) {
      handleStatusMessage(topic, payload).catch(err => {
        logger.error('MQTT: Unhandled error in status handler', { error: err.message });
      });
    } else if (topic.endsWith('/command/response')) {
      handleCommandResponse(topic, payload).catch(err => {
        logger.error('MQTT: Unhandled error in command response handler', { error: err.message });
      });
    }
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
