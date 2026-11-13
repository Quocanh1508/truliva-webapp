import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { requireAuth, requirePermission } from '../middleware/authSession';
import { publishCommand, SUPPORTED_COMMANDS, DeviceCommand } from '../services/mqttService';
import { resolveIotModel } from '../config/waterPurifiers';
import logger from '../utils/logger';
import { execFile } from 'child_process';

const SAFE_SERIAL_REGEX = /^[A-Za-z0-9_-]{3,64}$/;
const SAFE_MQTT_PASSWORD_REGEX = /^[^\0\r\n]{6,128}$/;

const router = Router();

// ── Kiểm tra lệnh theo spec đối tác (docs/IOT_PARTNER_INTEGRATION_GUIDE.md §4.4) ──
function validateCommand(
  command: string,
  input: Record<string, any>
): { command: DeviceCommand; params: Record<string, any> } | { error: string } {
  if (!(SUPPORTED_COMMANDS as readonly string[]).includes(command)) {
    return { error: `Lệnh không được hỗ trợ: "${command}". Chỉ chấp nhận: ${SUPPORTED_COMMANDS.join(', ')}` };
  }
  const cmd = command as DeviceCommand;

  if (cmd === 'set_interval') {
    const raw = input.interval ?? input.interval_s;
    const sec = Number(raw);
    if (raw === undefined || raw === null || raw === '' || !Number.isInteger(sec) || sec < 1 || sec > 3600) {
      return { error: 'interval phải là số nguyên từ 1 đến 3600 giây' };
    }
    return { command: cmd, params: { interval: sec } };
  }

  if (cmd === 'ota') {
    const { url, version, sha256, force } = input;
    if (typeof url !== 'string' || !/^https?:\/\/\S+$/i.test(url) || url.length > 255) {
      return { error: 'url phải là địa chỉ http(s) hợp lệ, tối đa 255 ký tự' };
    }
    if (typeof version !== 'string' || !/^[0-9A-Za-z._-]{1,32}$/.test(version)) {
      return { error: 'version không hợp lệ (1-32 ký tự: chữ, số, dấu chấm, gạch)' };
    }
    if (typeof sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(sha256)) {
      return { error: 'sha256 phải gồm 64 ký tự hex' };
    }
    if (force !== undefined && typeof force !== 'boolean') {
      return { error: 'force phải là true/false' };
    }
    return { command: cmd, params: { url, version, sha256: sha256.toLowerCase(), ...(force ? { force: true } : {}) } };
  }

  // ping, reboot: không có tham số
  return { command: cmd, params: {} };
}

// ── Helper format telemetry bóc tách lõi lọc và thông số phần cứng ──
function formatTelemetry(tel: any) {
  if (!tel) return null;
  const raw = (typeof tel.rawPayload === 'object' && tel.rawPayload !== null) ? tel.rawPayload : {};
  const filter1Val = raw.ppc != null ? Number(raw.ppc) : (raw.pcb != null ? Number(raw.pcb) : null);
  const filter1Bars = raw.ppc_bars != null ? Number(raw.ppc_bars) : (raw.pcb_bars != null ? Number(raw.pcb_bars) : null);
  const filter1Replace = raw.ppc_replace === true || raw.pcb_replace === true;

  return {
    ...tel,
    // Thông số lõi lọc nước Truliva (tương thích cả dòng 3 lõi PPC/PGP và dòng 2 lõi PCB)
    ppc: filter1Val,
    ppcBars: filter1Bars,
    ppcReplace: filter1Replace,
    pcb: filter1Val,
    pcbBars: filter1Bars,
    pcbReplace: filter1Replace,
    ro: raw.ro != null ? Number(raw.ro) : null,
    roBars: raw.ro_bars != null ? Number(raw.ro_bars) : null,
    roReplace: raw.ro_replace === true,
    cto: raw.cto != null ? Number(raw.cto) : null,
    ctoBars: raw.cto_bars != null ? Number(raw.cto_bars) : null,
    ctoReplace: raw.cto_replace === true,
    // Thông số phần cứng, Wi-Fi & bo mạch
    rssi: raw.rssi != null ? Number(raw.rssi) : null,
    ip: raw.ip || null,
    uptime: raw.uptime != null ? Number(raw.uptime) : null,
    uartOk: raw.uart_ok !== undefined ? raw.uart_ok : true,
    interval: raw.interval != null ? Number(raw.interval) : 5,
    statusByte: raw.status != null ? Number(raw.status) : null,
    fw: raw.fw || null,
  };
}

/**
 * GET /api/iot/devices
 * Danh sách tất cả thiết bị IoT
 */
router.get('/devices', requireAuth, requirePermission('IOT_MONITOR_VIEW'), async (req: Request, res: Response): Promise<void> => {
  try {
    // Mặc định ẩn máy đã lưu trữ; ?includeArchived=true để xem cả máy đã lưu trữ
    const includeArchived = req.query.includeArchived === 'true';
    const devices = await prisma.iotDevice.findMany({
      where: includeArchived ? {} : { isArchived: false },
      orderBy: { lastSeenAt: 'desc' },
      include: {
        _count: {
          select: {
            telemetryData: true,
            alerts: { where: { isResolved: false } }
          }
        }
      }
    });

    // Liên kết thông tin máy & khách hàng từ bảng Serial (nếu có)
    const serialNumbers = devices.map(d => d.serialNumber);
    const serialRecords = await prisma.serial.findMany({
      where: { serialNumber: { in: serialNumbers } },
      select: {
        serialNumber: true,
        model: true,
        productLine: true,
        customerName: true,
        customerPhone: true,
        status: true,
        activationDate: true,
      }
    });
    const serialMap = new Map(serialRecords.map(s => [s.serialNumber, s]));

    // Get latest telemetry for each device
    const devicesWithLatest = await Promise.all(
      devices.map(async (device) => {
        const latestTelemetry = await prisma.iotTelemetry.findFirst({
          where: { deviceId: device.id },
          orderBy: { recordedAt: 'desc' }
        });

        // Đọc live payload mới nhất để UI luôn cập nhật realtime
        const { latestPayload, latestPayloadAt, _count, ...deviceFields } = device;
        const liveData = (typeof latestPayload === 'object' && latestPayload !== null) ? (latestPayload as any) : null;

        const effectiveTelemetry = liveData
          ? {
              ...(latestTelemetry || {}),
              deviceId: device.id,
              rawPayload: liveData,
              tdsOut: liveData.tdsOut != null ? Number(liveData.tdsOut) : latestTelemetry?.tdsOut,
              tdsIn: liveData.tdsIn != null ? Number(liveData.tdsIn) : latestTelemetry?.tdsIn,
              recordedAt: latestPayloadAt || latestTelemetry?.recordedAt || device.lastSeenAt || new Date().toISOString()
            }
          : latestTelemetry;

        return {
          ...deviceFields,
          _count,
          serialInfo: serialMap.get(device.serialNumber) || null,
          // Dòng máy (2/3 lõi) — nguồn duy nhất dùng chung với logic cảnh báo trong mqttService
          modelConfig: resolveIotModel(serialMap.get(device.serialNumber), device.serialNumber, liveData ?? latestTelemetry?.rawPayload),
          latestTelemetry: formatTelemetry(effectiveTelemetry),
          unresolvedAlerts: device._count.alerts,
          totalReadings: device._count.telemetryData,
        };
      })
    );

    res.json({ devices: devicesWithLatest });
  } catch (error: any) {
    logger.error('IoT API: Get devices error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi lấy danh sách thiết bị' });
  }
});

/**
 * GET /api/iot/devices/:serialNumber
 * Chi tiết 1 thiết bị + telemetry gần nhất
 */
router.get('/devices/:serialNumber', requireAuth, requirePermission('IOT_MONITOR_VIEW'), async (req: Request, res: Response): Promise<void> => {
  try {
    const serialNumber = req.params.serialNumber as string;

    const device = await prisma.iotDevice.findUnique({
      where: { serialNumber },
      include: {
        alerts: {
          where: { isResolved: false },
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!device) {
      res.status(404).json({ error: 'Thiết bị không tồn tại' });
      return;
    }

    // Get latest 10 telemetry records
    const recentTelemetry = await prisma.iotTelemetry.findMany({
      where: { deviceId: device.id },
      orderBy: { recordedAt: 'desc' },
      take: 10,
    });

    const serialInfo = await prisma.serial.findUnique({
      where: { serialNumber },
      select: {
        serialNumber: true,
        model: true,
        productLine: true,
        customerName: true,
        customerPhone: true,
        status: true,
        activationDate: true,
      }
    });

    const { latestPayload, latestPayloadAt, ...deviceFields } = device;
    const liveData = (typeof latestPayload === 'object' && latestPayload !== null) ? (latestPayload as any) : null;

    const formattedRecent = recentTelemetry.map(formatTelemetry);
    if (liveData && formattedRecent.length > 0) {
      formattedRecent[0] = formatTelemetry({
        ...formattedRecent[0],
        rawPayload: liveData,
        tdsOut: liveData.tdsOut != null ? Number(liveData.tdsOut) : formattedRecent[0].tdsOut,
        recordedAt: latestPayloadAt || formattedRecent[0].recordedAt
      });
    }

    res.json({
      device: {
        ...deviceFields,
        serialInfo,
        modelConfig: resolveIotModel(serialInfo, device.serialNumber, liveData ?? recentTelemetry[0]?.rawPayload),
      },
      recentTelemetry: formattedRecent
    });
  } catch (error: any) {
    logger.error('IoT API: Get device detail error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi lấy chi tiết thiết bị' });
  }
});

/**
 * GET /api/iot/devices/:serialNumber/telemetry
 * Lịch sử telemetry (có filter by time range)
 * Query params: from (ISO date), to (ISO date), limit (number, default 100)
 */
router.get('/devices/:serialNumber/telemetry', requireAuth, requirePermission('IOT_MONITOR_VIEW'), async (req: Request, res: Response): Promise<void> => {
  try {
    const serialNumber = req.params.serialNumber as string;
    const { from, to, limit } = req.query;

    const device = await prisma.iotDevice.findUnique({
      where: { serialNumber }
    });

    if (!device) {
      res.status(404).json({ error: 'Thiết bị không tồn tại' });
      return;
    }

    const where: any = { deviceId: device.id };
    if (from || to) {
      where.recordedAt = {};
      if (from) where.recordedAt.gte = new Date(from as string);
      if (to) where.recordedAt.lte = new Date(to as string);
    }

    const telemetry = await prisma.iotTelemetry.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: Math.min(Number(limit) || 100, 1000),
    });

    res.json({
      telemetry: telemetry.map(formatTelemetry),
      total: telemetry.length
    });
  } catch (error: any) {
    logger.error('IoT API: Get telemetry error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi lấy lịch sử dữ liệu' });
  }
});

/**
 * GET /api/iot/alerts
 * Danh sách cảnh báo (filter by type, severity, resolved)
 */
router.get('/alerts', requireAuth, requirePermission('IOT_MONITOR_VIEW'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, severity, resolved, limit } = req.query;

    // Không hiển thị cảnh báo của máy đã lưu trữ
    const where: any = { device: { isArchived: false } };
    if (type) where.alertType = type as string;
    if (severity) where.severity = severity as string;
    if (resolved !== undefined) where.isResolved = resolved === 'true';

    const alerts = await prisma.iotAlert.findMany({
      where,
      include: {
        device: {
          select: { serialNumber: true, firmwareVersion: true, isMuted: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200),
    });

    const unresolvedCount = await prisma.iotAlert.count({
      where: { isResolved: false, device: { isArchived: false } }
    });

    res.json({ alerts, unresolvedCount });
  } catch (error: any) {
    logger.error('IoT API: Get alerts error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi lấy danh sách cảnh báo' });
  }
});

/**
 * POST /api/iot/devices
 * Đăng ký thiết bị mới + tạo MQTT credentials
 */
router.post('/devices', requireAuth, requirePermission('IOT_DEVICE_CONTROL'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { serialNumber, mqttPassword } = req.body;

    if (!serialNumber || typeof serialNumber !== 'string') {
      res.status(400).json({ error: 'Thiếu serialNumber' });
      return;
    }

    const cleanSerial = serialNumber.trim();
    if (!SAFE_SERIAL_REGEX.test(cleanSerial)) {
      res.status(400).json({ error: 'serialNumber không hợp lệ (chỉ cho phép chữ cái, số, dấu gạch ngang và gạch dưới, độ dài 3-64 ký tự)' });
      return;
    }

    if (mqttPassword !== undefined && mqttPassword !== null && mqttPassword !== '') {
      if (typeof mqttPassword !== 'string' || !SAFE_MQTT_PASSWORD_REGEX.test(mqttPassword)) {
        res.status(400).json({ error: 'mqttPassword không hợp lệ (độ dài 6-128 ký tự, không chứa ký tự điều khiển)' });
        return;
      }
    }

    // Check if device already exists
    const existing = await prisma.iotDevice.findUnique({
      where: { serialNumber: cleanSerial }
    });

    if (existing && !existing.isArchived) {
      res.status(409).json({ error: 'Thiết bị đã tồn tại', device: existing });
      return;
    }

    // Máy đã lưu trữ trước đó → khôi phục (giữ nguyên lịch sử telemetry & cảnh báo cũ)
    const isRestore = Boolean(existing);
    const device = existing
      ? await prisma.iotDevice.update({
          where: { id: existing.id },
          data: {
            isArchived: false,
            archivedAt: null,
            archivedBy: null,
            isOnline: false,
          }
        })
      : await prisma.iotDevice.create({
          data: {
            serialNumber: cleanSerial,
            mqttUsername: cleanSerial,
            isOnline: false,
          }
        });

    // Create MQTT user on Mosquitto (if password provided) using execFile with shell: false
    if (mqttPassword) {
      await new Promise<void>((resolve, reject) => {
        execFile(
          'mosquitto_passwd',
          ['-b', '/etc/mosquitto/passwd', cleanSerial, mqttPassword],
          { shell: false },
          (error) => {
            if (error) {
              logger.error('IoT API: Failed to create MQTT user', { serial: cleanSerial, error: error.message });
              reject(error);
              return;
            }

            execFile('systemctl', ['reload', 'mosquitto'], { shell: false }, (reloadErr) => {
              if (reloadErr) {
                execFile('killall', ['-HUP', 'mosquitto'], { shell: false }, () => {
                  logger.info('IoT API: MQTT user created & broker reloaded via HUP', { serial: cleanSerial });
                  resolve();
                });
              } else {
                logger.info('IoT API: MQTT user created & broker reloaded', { serial: cleanSerial });
                resolve();
              }
            });
          }
        );
      });
    }

    res.status(isRestore ? 200 : 201).json({
      message: isRestore ? 'Thiết bị đã được khôi phục từ lưu trữ' : 'Thiết bị đã được đăng ký',
      restored: isRestore,
      device,
      mqttConfig: {
        broker: process.env.MQTT_PUBLIC_HOST || 'trulivaofficial.com',
        port: 1883,
        username: cleanSerial,
        topic: `truliva/devices/${cleanSerial}/telemetry`,
      }
    });
  } catch (error: any) {
    logger.error('IoT API: Register device error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi đăng ký thiết bị' });
  }
});

/**
 * POST /api/iot/devices/:serialNumber/command
 * Gửi lệnh xuống ESP32 qua MQTT (reboot, set_interval, ping, ota)
 */
router.post('/devices/:serialNumber/command', requireAuth, requirePermission('IOT_DEVICE_CONTROL'), async (req: Request, res: Response): Promise<void> => {
  try {
    const serialNumber = req.params.serialNumber as string;
    const { command, cmd, params, ...rest } = req.body || {};
    const targetCommand = command || cmd;

    if (!targetCommand) {
      res.status(400).json({ error: 'Thiếu command (hoặc cmd)' });
      return;
    }

    // Chỉ nhận tham số được khai báo cho từng lệnh (field lạ bị bỏ qua, không chuyển xuống thiết bị)
    const validated = validateCommand(String(targetCommand), { ...(rest || {}), ...(params || {}) });
    if ('error' in validated) {
      res.status(400).json({ error: validated.error });
      return;
    }

    const device = await prisma.iotDevice.findUnique({
      where: { serialNumber }
    });

    if (!device) {
      res.status(404).json({ error: 'Thiết bị không tồn tại' });
      return;
    }

    if (device.isArchived) {
      res.status(409).json({ error: 'Thiết bị đã được lưu trữ, không thể gửi lệnh' });
      return;
    }

    const sentBy = (req as any).user?.username || null;
    const result = await publishCommand(device, validated.command, validated.params, sentBy);

    if (!result.ok) {
      const errors: Record<string, [number, string]> = {
        not_connected: [503, 'MQTT chưa kết nối, không thể gửi lệnh'],
        too_long: [400, 'Lệnh vượt quá 767 byte cho phép'],
        timeout: [504, 'Broker MQTT không xác nhận lệnh trong 5 giây'],
        publish_failed: [502, 'Broker MQTT từ chối lệnh'],
      };
      const [status, msg] = errors[result.reason] || [500, 'Lỗi khi gửi lệnh'];
      res.status(status).json({ error: msg, reason: result.reason });
      return;
    }

    // Broker đã nhận lệnh; thiết bị xác nhận sau qua topic command/response (xem configJson.lastCommand)
    res.json({
      message: device.isOnline
        ? `Lệnh "${validated.command}" đã gửi tới ${serialNumber}, đang chờ máy phản hồi`
        : `Lệnh "${validated.command}" đã gửi tới broker, nhưng máy ${serialNumber} đang OFFLINE nên có thể không nhận được`,
      command: validated.command,
      params: validated.params,
      requestId: result.requestId,
      deviceOnline: device.isOnline,
    });
  } catch (error: any) {
    logger.error('IoT API: Send command error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi gửi lệnh' });
  }
});

/**
 * PATCH /api/iot/alerts/:id/resolve
 * Đánh dấu cảnh báo đã xử lý
 */
router.patch('/alerts/:id/resolve', requireAuth, requirePermission('IOT_DEVICE_CONTROL'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const alert = await prisma.iotAlert.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      }
    });

    res.json({ message: 'Đã đánh dấu xử lý', alert });
  } catch (error: any) {
    logger.error('IoT API: Resolve alert error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi cập nhật cảnh báo' });
  }
});

/**
 * POST /api/iot/alerts/resolve-all
 * Đánh dấu đã xử lý tất cả cảnh báo chưa giải quyết (tuân thủ Rule 7: Zero Hard-Delete Policy)
 */
router.post('/alerts/resolve-all', requireAuth, requirePermission('IOT_DEVICE_CONTROL'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { serialNumber } = req.body;

    let whereClause: any = { isResolved: false };
    if (serialNumber) {
      const device = await prisma.iotDevice.findUnique({
        where: { serialNumber }
      });
      if (device) {
        whereClause.deviceId = device.id;
      } else {
        res.status(404).json({ error: 'Thiết bị không tồn tại' });
        return;
      }
    }

    const result = await prisma.iotAlert.updateMany({
      where: whereClause,
      data: {
        isResolved: true,
        resolvedAt: new Date()
      }
    });

    logger.info(`IoT API: Bulk resolved ${result.count} alerts`, { serialNumber });
    res.json({
      message: `Đã đánh dấu xử lý ${result.count} cảnh báo`,
      count: result.count
    });
  } catch (error: any) {
    logger.error('IoT API: Bulk resolve alerts error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi xử lý cảnh báo hàng loạt' });
  }
});

/**
 * PATCH /api/iot/devices/:serialNumber/mute
 * Bật/tắt chế độ tắt thông báo (Mute / Do Not Disturb) cho thiết bị IoT
 */
router.patch('/devices/:serialNumber/mute', requireAuth, requirePermission('IOT_DEVICE_CONTROL'), async (req: Request, res: Response): Promise<void> => {
  try {
    const serialNumber = req.params.serialNumber as string;
    const { muted = true, resolveExisting = true } = req.body;

    const device = await prisma.iotDevice.findUnique({
      where: { serialNumber }
    });

    if (!device) {
      res.status(404).json({ error: 'Thiết bị không tồn tại' });
      return;
    }

    const isMuted = Boolean(muted);

    // Ghi vào cột riêng — không đụng tới configJson nên không bị telemetry ghi đè
    await prisma.iotDevice.update({
      where: { id: device.id },
      data: {
        isMuted,
        mutedAt: isMuted ? new Date() : null,
        mutedBy: (req as any).user?.username || 'admin'
      }
    });

    let resolvedCount = 0;
    // Nếu bật mute và resolveExisting = true (mặc định), tự động giải quyết tất cả cảnh báo đang mở của máy này
    if (isMuted && resolveExisting) {
      const updateResult = await prisma.iotAlert.updateMany({
        where: {
          deviceId: device.id,
          isResolved: false
        },
        data: {
          isResolved: true,
          resolvedAt: new Date()
        }
      });
      resolvedCount = updateResult.count;
    }

    logger.info(`IoT API: Device ${serialNumber} mute changed to ${isMuted}`, {
      serialNumber,
      isMuted,
      resolvedCount
    });

    res.json({
      message: isMuted
        ? `Đã tắt thông báo cho máy ${serialNumber}${resolvedCount > 0 ? ` và xử lý ${resolvedCount} cảnh báo cũ` : ''}`
        : `Đã bật lại thông báo cho máy ${serialNumber}`,
      isMuted,
      resolvedCount
    });
  } catch (error: any) {
    logger.error('IoT API: Toggle mute error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái thông báo' });
  }
});

/**
 * DELETE /api/iot/devices/:serialNumber
 * Lưu trữ và hủy kích hoạt thiết bị IoT (TUÂN THỦ NGUYÊN TẮC ZERO HARD-DELETE)
 */
router.delete('/devices/:serialNumber', requireAuth, requirePermission('IOT_DEVICE_CONTROL'), async (req: Request, res: Response): Promise<void> => {
  try {
    const serialNumber = req.params.serialNumber as string;

    const device = await prisma.iotDevice.findUnique({
      where: { serialNumber }
    });

    if (!device) {
      res.status(404).json({ error: 'Thiết bị không tồn tại' });
      return;
    }

    if (device.isArchived) {
      res.json({ message: `Thiết bị ${serialNumber} đã được lưu trữ trước đó`, resolvedCount: 0 });
      return;
    }

    // Soft-archive device (tuân thủ Rule 7: Zero Hard-Delete Policy).
    // Máy đã lưu trữ: bị ẩn khỏi danh sách, telemetry/status gửi lên bị bỏ qua, không phát sinh cảnh báo.
    // Đăng ký lại cùng serial (POST /devices) sẽ khôi phục máy.
    const now = new Date();
    const [, resolved] = await prisma.$transaction([
      prisma.iotDevice.update({
        where: { id: device.id },
        data: {
          isOnline: false,
          isArchived: true,
          archivedAt: now,
          archivedBy: (req as any).user?.username || 'admin'
        }
      }),
      prisma.iotAlert.updateMany({
        where: { deviceId: device.id, isResolved: false },
        data: { isResolved: true, resolvedAt: now }
      })
    ]);

    res.json({
      message: `Đã lưu trữ và ngắt kích hoạt thiết bị ${serialNumber}`,
      resolvedCount: resolved.count
    });
  } catch (error: any) {
    logger.error('IoT API: Archive device error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi xử lý thiết bị' });
  }
});

export default router;
