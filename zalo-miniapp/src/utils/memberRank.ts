export type MemberTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND';

export interface RankConfig {
  tier: MemberTier;
  label: string;
  badgeBg: string;
  borderColor: string;
  textColor: string;
  iconColor: string;
  ringColor: string;
  shadowGlow: string;
  minPoints: number;
}

export const RANK_CONFIGS: Record<MemberTier, RankConfig> = {
  BRONZE: {
    tier: 'BRONZE',
    label: 'Thành viên Đồng',
    badgeBg: 'bg-gradient-to-r from-[#D97706]/40 via-[#B45309]/35 to-[#78350F]/60',
    borderColor: 'border-[#F59E0B]',
    textColor: 'text-[#FEF3C7]',
    iconColor: '#FBBF24',
    ringColor: 'border-[#F59E0B] ring-[#F59E0B]/40 shadow-[0_0_15px_rgba(245,158,11,0.5)]',
    shadowGlow: 'shadow-[0_0_12px_rgba(217,119,6,0.45)]',
    minPoints: 0
  },
  SILVER: {
    tier: 'SILVER',
    label: 'Thành viên Bạc',
    badgeBg: 'bg-gradient-to-r from-[#E2E8F0]/35 via-[#CBD5E1]/30 to-[#94A3B8]/50',
    borderColor: 'border-[#F8FAFC]',
    textColor: 'text-white',
    iconColor: '#F8FAFC',
    ringColor: 'border-[#F8FAFC] ring-[#E2E8F0]/50 shadow-[0_0_15px_rgba(248,250,252,0.5)]',
    shadowGlow: 'shadow-[0_0_12px_rgba(226,232,240,0.45)]',
    minPoints: 200
  },
  GOLD: {
    tier: 'GOLD',
    label: 'Thành viên Vàng',
    badgeBg: 'bg-gradient-to-r from-[#FACC15]/45 via-[#EAB308]/40 to-[#A16207]/60',
    borderColor: 'border-[#FDE047]',
    textColor: 'text-[#FEF9C3]',
    iconColor: '#FACC15',
    ringColor: 'border-[#FDE047] ring-[#FACC15]/50 shadow-[0_0_18px_rgba(250,204,21,0.65)]',
    shadowGlow: 'shadow-[0_0_15px_rgba(250,204,21,0.6)]',
    minPoints: 500
  },
  DIAMOND: {
    tier: 'DIAMOND',
    label: 'Thành viên Kim Cương',
    badgeBg: 'bg-gradient-to-r from-[#E879F9]/40 via-[#C084FC]/35 to-[#6B21A8]/60',
    borderColor: 'border-[#F0ABFC]',
    textColor: 'text-[#FDF4FF]',
    iconColor: '#F0ABFC',
    ringColor: 'border-[#F0ABFC] ring-[#C084FC]/50 shadow-[0_0_18px_rgba(232,121,249,0.65)]',
    shadowGlow: 'shadow-[0_0_15px_rgba(232,121,249,0.55)]',
    minPoints: 1000
  }
};

export const NEXT_TIER_ORDER: MemberTier[] = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND'];

export function getCustomerRank(user: any, pointsOverride?: number): RankConfig {
  const explicitTier = String(user?.tier || user?.rank || user?.membershipTier || '').toUpperCase();
  if (explicitTier.includes('DIAMOND') || explicitTier.includes('KIM CƯƠNG') || explicitTier.includes('PLATINUM')) {
    return RANK_CONFIGS.DIAMOND;
  }
  if (explicitTier.includes('GOLD') || explicitTier.includes('VÀNG')) {
    return RANK_CONFIGS.GOLD;
  }
  if (explicitTier.includes('SILVER') || explicitTier.includes('BẠC')) {
    return RANK_CONFIGS.SILVER;
  }
  if (explicitTier.includes('BRONZE') || explicitTier.includes('ĐỒNG')) {
    return RANK_CONFIGS.BRONZE;
  }

  const points = typeof pointsOverride === 'number' 
    ? pointsOverride 
    : Number(user?.rewardPoints ?? user?.points ?? 250);

  if (points >= 1000) return RANK_CONFIGS.DIAMOND;
  if (points >= 500) return RANK_CONFIGS.GOLD;
  if (points >= 200) return RANK_CONFIGS.SILVER;
  return RANK_CONFIGS.BRONZE;
}
