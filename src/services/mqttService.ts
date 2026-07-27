import mqtt, { MqttClient } from 'mqtt';
import logger from '../utils/logger';
import prisma from '../config/database';

// ── MQTT Configuration ──
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'truliva_backend';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'TrulivaM0tt@2026';
const TELEMETRY_TOPIC = 'truliva/devices/+/telemetry';
const STATUS_TOPIC = 'truliva/devices/+/status';

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
  // topic format: truliva/devices/<SERIAL>/telemetry
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

  // Validate serial matches between topic and payload
  const payloadSerial = data.sn || data.serialNumber;
  if (!payloadSerial) {
    logger.warn('MQTT: Missing serial number in payload', { topic });
    return;
  }
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

    if (!device) {
      // Auto-register new device
      device = await prisma.iotDevice.create({
        data: {
          serialNumber: topicSerial,
          mqttUsername: topicSerial,
          firmwareVersion: data.fw || null,
          lastSeenAt: new Date(),
          isOnline: true,
        }
      });
      logger.info('MQTT: Auto-registered new IoT device', { serial: topicSerial });
    } else {
      // Update device status
      await prisma.iotDevice.update({
        where: { id: device.id },
        data: {
          lastSeenAt: new Date(),
          isOnline: true,
          firmwareVersion: data.fw || device.firmwareVersion,
        }
      });
    }

    // 2. Store telemetry data
    const pumpStatus = parsePumpStatus(data.pump);
    await prisma.iotTelemetry.create({
      data: {
        deviceId: device.id,
        tdsIn: data.tds_in != null ? Number(data.tds_in) : null,
        tdsOut: data.tds_out != null ? Number(data.tds_out) : null,
        waterFlowLpm: data.flow != null ? Number(data.flow) : null,
        totalLiters: data.total_l != null ? Number(data.total_l) : null,
        waterPressure: data.pressure != null ? Number(data.pressure) : null,
        pumpStatus: pumpStatus !== 'UNKNOWN' ? pumpStatus : null,
        errorCode: data.err != null ? Number(data.err) : 0,
        rawPayload: data,
        recordedAt: data.ts ? new Date(data.ts * 1000) : new Date(),
      }
    });

    // 3. Check alert thresholds
    await checkAlerts(device.id, topicSerial, data, pumpStatus);

    logger.debug('MQTT: Telemetry stored', { serial: topicSerial, tdsIn: data.tds_in, tdsOut: data.tds_out });
  } catch (error: any) {
    logger.error('MQTT: Error processing telemetry', {
      serial: topicSerial,
      error: error.message
    });
  }
}

// ── Check alert conditions ──
async function checkAlerts(deviceId: string, serial: string, data: any, pumpStatus: string) {
  const tdsOut = data.tds_out != null ? Number(data.tds_out) : null;
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

// ── Publish command to device ──
export function publishCommand(serialNumber: string, command: string, params: any = {}) {
  if (!mqttClient || !mqttClient.connected) {
    logger.error('MQTT: Client not connected, cannot publish command');
    return false;
  }

  const topic = `truliva/devices/${serialNumber}/command`;
  const payload = JSON.stringify({ cmd: command, params });

  mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      logger.error('MQTT: Failed to publish command', { serial: serialNumber, error: err.message });
    } else {
      logger.info('MQTT: Command published', { serial: serialNumber, command });
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

    // Subscribe to telemetry and status topics
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
