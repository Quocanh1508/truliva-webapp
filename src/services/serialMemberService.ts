import prisma from '../config/database';
import { normalizePhone } from './zaloMiniAppService';

// Người dùng chung máy (người nhà): chủ máy thêm SĐT, người đó đăng nhập Zalo bằng SĐT của chính mình là thấy máy.
export const MAX_SERIAL_MEMBERS = 5;

export const phoneVariantsOf = (phone: string): string[] => {
  const p = normalizePhone(phone);
  return p.startsWith('0') ? [p, '84' + p.slice(1), p.slice(1), '+84' + p.slice(1)] : [p];
};

/** SĐT di động VN 10 số, trả về dạng 0xxxxxxxxx hoặc null. */
export function parseVnMobile(input: unknown): string | null {
  const p = normalizePhone(String(input || ''));
  return /^0[35789]\d{8}$/.test(p) ? p : null;
}

const maskPhone = (p?: string | null) => (p && p.length >= 7 ? `${p.slice(0, 3)}••••${p.slice(-3)}` : '');

/** Chủ máy = SĐT trên serial, hoặc SĐT người nhận / khách của đơn gắn với serial. */
export async function isSerialOwner(serialId: string, phoneVariants: string[]): Promise<boolean> {
  const n = await prisma.serial.count({
    where: {
      id: serialId,
      OR: [
        { customerPhone: { in: phoneVariants } },
        { order: { billPhoneNumber: { in: phoneVariants } } },
        { order: { customer: { phoneNumber: { in: phoneVariants } } } },
      ],
    },
  });
  return n > 0;
}

/**
 * Bổ sung cho danh sách máy của /my-serials (sửa tại chỗ):
 * - máy mình sở hữu (có bản ghi serial thật): canShare + danh sách người dùng chung
 * - máy được chia sẻ cho mình: thêm vào cuối, chỉ giữ thông tin máy (không lộ tên/địa chỉ/hoá đơn của chủ máy)
 */
export async function attachSerialSharing(allSerials: any[], phoneVariants: string[]): Promise<void> {
  const realIds = allSerials.filter(s => typeof s.id === 'string' && !s.id.startsWith('order-')).map(s => s.id);
  const ownedIds = new Set<string>();
  for (const id of realIds) if (await isSerialOwner(id, phoneVariants)) ownedIds.add(id);

  const members = ownedIds.size
    ? await prisma.serialMember.findMany({ where: { serialId: { in: [...ownedIds] } }, orderBy: { createdAt: 'asc' } })
    : [];
  const memberUsers = members.length
    ? await prisma.user.findMany({
        where: { phoneNumber: { in: members.flatMap(m => phoneVariantsOf(m.phone)) } },
        select: { phoneNumber: true, fullName: true },
      })
    : [];
  const nameByPhone = new Map(memberUsers.map(u => [normalizePhone(u.phoneNumber || ''), u.fullName]));

  for (const s of allSerials) {
    if (!ownedIds.has(s.id)) continue;
    s.canShare = true;
    s.members = members
      .filter(m => m.serialId === s.id)
      .map(m => ({ id: m.id, phone: m.phone, name: nameByPhone.get(m.phone) || null, createdAt: m.createdAt }));
  }

  const have = new Set(allSerials.map(s => s.serialNumber));
  const shared = await prisma.serialMember.findMany({
    where: { phone: { in: phoneVariants } },
    include: { serial: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const m of shared) {
    const s = m.serial;
    if (have.has(s.serialNumber)) continue;
    have.add(s.serialNumber);
    allSerials.push({
      id: s.id,
      serialNumber: s.serialNumber,
      model: s.model,
      productLine: s.productLine,
      status: s.status,
      activationDate: s.activationDate,
      warrantyExpiryDate: s.warrantyExpiryDate,
      isShared: true,
      membershipId: m.id,
      ownerPhoneMasked: maskPhone(normalizePhone(s.customerPhone || '')),
    });
  }
}
