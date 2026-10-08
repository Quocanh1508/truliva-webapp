import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import { publishCommand } from '../services/mqttService';
import logger from '../utils/logger';
import { exec } from 'child_process';

const router = Router();

/**
 * GET /api/iot/devices
 * Danh sách tất cả thiết bị IoT
 */
router.get('/devices', requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const devices = await prisma.iotDevice.findMany({
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

    // Get latest telemetry for each device
    const devicesWithLatest = await Promise.all(
      devices.map(async (device) => {
        const latestTelemetry = await prisma.iotTelemetry.findFirst({
          where: { deviceId: device.id },
          orderBy: { recordedAt: 'desc' }
        });

        return {
          ...device,
          latestTelemetry,
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
router.get('/devices/:serialNumber', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
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

    res.json({ device, recentTelemetry });
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
router.get('/devices/:serialNumber/telemetry', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
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

    res.json({ telemetry, total: telemetry.length });
  } catch (error: any) {
    logger.error('IoT API: Get telemetry error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi lấy lịch sử dữ liệu' });
  }
});

/**
 * GET /api/iot/alerts
 * Danh sách cảnh báo (filter by type, severity, resolved)
 */
router.get('/alerts', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, severity, resolved, limit } = req.query;

    const where: any = {};
    if (type) where.alertType = type as string;
    if (severity) where.severity = severity as string;
    if (resolved !== undefined) where.isResolved = resolved === 'true';

    const alerts = await prisma.iotAlert.findMany({
      where,
      include: {
        device: {
          select: { serialNumber: true, firmwareVersion: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200),
    });

    const unresolvedCount = await prisma.iotAlert.count({
      where: { isResolved: false }
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
router.post('/devices', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { serialNumber, mqttPassword } = req.body;

    if (!serialNumber) {
      res.status(400).json({ error: 'Thiếu serialNumber' });
      return;
    }

    // Check if device already exists
    const existing = await prisma.iotDevice.findUnique({
      where: { serialNumber: serialNumber as string }
    });

    if (existing) {
      res.status(409).json({ error: 'Thiết bị đã tồn tại', device: existing });
      return;
    }

    // Create device in DB
    const device = await prisma.iotDevice.create({
      data: {
        serialNumber: serialNumber as string,
        mqttUsername: serialNumber as string,
        isOnline: false,
      }
    });

    // Create MQTT user on Mosquitto (if password provided)
    if (mqttPassword) {
      await new Promise<void>((resolve, reject) => {
        exec(
          `mosquitto_passwd -b /etc/mosquitto/passwd "${serialNumber}" "${mqttPassword}" && (systemctl reload mosquitto || kill -HUP $(pidof mosquitto) || true)`,
          (error) => {
            if (error) {
              logger.error('IoT API: Failed to create MQTT user', { serial: serialNumber, error: error.message });
              reject(error);
            } else {
              logger.info('IoT API: MQTT user created & broker reloaded', { serial: serialNumber });
              resolve();
            }
          }
        );
      });
    }

    res.status(201).json({
      message: 'Thiết bị đã được đăng ký',
      device,
      mqttConfig: {
        broker: process.env.MQTT_PUBLIC_HOST || 'trulivaofficial.com',
        port: 1883,
        username: serialNumber,
        topic: `truliva/devices/${serialNumber}/telemetry`,
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
router.post('/devices/:serialNumber/command', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const serialNumber = req.params.serialNumber as string;
    const { command, cmd, params, ...rest } = req.body;
    const targetCommand = command || cmd;

    if (!targetCommand) {
      res.status(400).json({ error: 'Thiếu command (hoặc cmd)' });
      return;
    }

    const device = await prisma.iotDevice.findUnique({
      where: { serialNumber }
    });

    if (!device) {
      res.status(404).json({ error: 'Thiết bị không tồn tại' });
      return;
    }

    const mergedParams = { ...(params || {}), ...rest };
    const success = publishCommand(serialNumber, targetCommand, mergedParams);

    if (success) {
      res.json({ message: `Lệnh "${targetCommand}" đã gửi tới ${serialNumber}`, command: targetCommand, params: mergedParams });
    } else {
      res.status(503).json({ error: 'MQTT chưa kết nối, không thể gửi lệnh' });
    }
  } catch (error: any) {
    logger.error('IoT API: Send command error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi gửi lệnh' });
  }
});

/**
 * PATCH /api/iot/alerts/:id/resolve
 * Đánh dấu cảnh báo đã xử lý
 */
router.patch('/alerts/:id/resolve', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
 * DELETE /api/iot/devices/:serialNumber
 * Lưu trữ và hủy kích hoạt thiết bị IoT (TUÂN THỦ NGUYÊN TẮC ZERO HARD-DELETE)
 */
router.delete('/devices/:serialNumber', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const serialNumber = req.params.serialNumber as string;

    const device = await prisma.iotDevice.findUnique({
      where: { serialNumber }
    });

    if (!device) {
      res.status(404).json({ error: 'Thiết bị không tồn tại' });
      return;
    }

    // Soft-archive device (tuân thủ Rule 7: Zero Hard-Delete Policy)
    const currentConfig = (typeof device.configJson === 'object' && device.configJson !== null)
      ? (device.configJson as Record<string, any>)
      : {};

    await prisma.iotDevice.update({
      where: { id: device.id },
      data: {
        isOnline: false,
        configJson: {
          ...currentConfig,
          isArchived: true,
          archivedAt: new Date().toISOString(),
          archivedBy: (req as any).user?.username || 'admin'
        }
      }
    });

    res.json({ message: `Đã lưu trữ và ngắt kích hoạt thiết bị ${serialNumber}` });
  } catch (error: any) {
    logger.error('IoT API: Archive device error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi xử lý thiết bị' });
  }
});

export default router;
