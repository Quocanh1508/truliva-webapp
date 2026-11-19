import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireCustomerAuth } from '../middleware/authSession';
import { MAX_SERIAL_MEMBERS, isSerialOwner, parseVnMobile, phoneVariantsOf } from '../services/serialMemberService';

// Gắn dưới /api/zalo-miniapp/serial-members
const router = Router();
router.use(requireCustomerAuth);

/** Chủ máy thêm SĐT người dùng chung. Body: { serialId, phone } */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const myPhone = req.user?.phoneNumber;
    const { serialId } = req.body || {};
    const phone = parseVnMobile(req.body?.phone);
    if (!myPhone || typeof serialId !== 'string') {
      res.status(400).json({ error: 'Thiếu thông tin máy' });
      return;
    }
    if (!phone) {
      res.status(400).json({ error: 'Số điện thoại chưa đúng. Nhập số di động 10 chữ số, ví dụ 0912345678.' });
      return;
    }
    if (!(await isSerialOwner(serialId, phoneVariantsOf(myPhone)))) {
      res.status(403).json({ error: 'Chỉ chủ máy mới thêm được người dùng chung' });
      return;
    }
    if (await isSerialOwner(serialId, phoneVariantsOf(phone))) {
      res.status(400).json({ error: 'Số này là chủ máy, đã xem được máy rồi' });
      return;
    }
    if (await prisma.serialMember.findUnique({ where: { serialId_phone: { serialId, phone } } })) {
      res.status(409).json({ error: 'Số này đã được thêm vào máy' });
      return;
    }
    // shortcut: đếm rồi mới tạo, 2 lần thêm cùng lúc có thể vượt giới hạn 1 người; chấp nhận được vì chỉ chủ máy thao tác
    if ((await prisma.serialMember.count({ where: { serialId } })) >= MAX_SERIAL_MEMBERS) {
      res.status(400).json({ error: `Mỗi máy chia sẻ tối đa ${MAX_SERIAL_MEMBERS} người` });
      return;
    }
    const member = await prisma.serialMember.create({ data: { serialId, phone, addedById: req.user!.id } });
    logger.info('Serial member added', { serialId, memberId: member.id, by: req.user!.id });
    res.json({ success: true, member: { id: member.id, phone: member.phone, name: null, createdAt: member.createdAt } });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      res.status(409).json({ error: 'Số này đã được thêm vào máy' });
      return;
    }
    logger.error('Add serial member error', { error: error.message });
    res.status(500).json({ error: 'Không thêm được, vui lòng thử lại' });
  }
});

/** Chủ máy gỡ một người, hoặc người dùng chung tự rời khỏi máy. */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.phoneNumber) {
      res.status(403).json({ error: 'Tài khoản chưa có số điện thoại' });
      return;
    }
    const myVariants = phoneVariantsOf(req.user.phoneNumber);
    const member = await prisma.serialMember.findUnique({ where: { id: String(req.params.id) } });
    if (!member) {
      res.status(404).json({ error: 'Không tìm thấy' });
      return;
    }
    const isSelf = myVariants.includes(member.phone);
    if (!isSelf && !(await isSerialOwner(member.serialId, myVariants))) {
      res.status(403).json({ error: 'Bạn không có quyền gỡ người này' });
      return;
    }
    await prisma.serialMember.delete({ where: { id: member.id } });
    logger.info('Serial member removed', { serialId: member.serialId, memberId: member.id, by: req.user!.id, isSelf });
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Remove serial member error', { error: error.message });
    res.status(500).json({ error: 'Không gỡ được, vui lòng thử lại' });
  }
});

export default router;
