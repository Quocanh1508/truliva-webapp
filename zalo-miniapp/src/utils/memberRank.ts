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
    badgeBg: 'bg-gradient-to-r from-[#B87333]/30 via-[#CD7F32]/25 to-[#8B4513]/40',
    borderColor: 'border-[#E59866]/80',
    textColor: 'text-[#FAD7A0]',
    iconColor: '#E59866',
    ringColor: 'border-[#E59866] ring-[#E59866]/40 shadow-[0_0_15px_rgba(229,152,102,0.45)]',
    shadowGlow: 'shadow-[0_0_12px_rgba(205,127,50,0.35)]',
    minPoints: 0
  },
  SILVER: {
    tier: 'SILVER',
    label: 'Thành viên Bạc',
    badgeBg: 'bg-gradient-to-r from-[#00D2FF]/20 via-[#38BDF8]/20 to-[#0284C7]/40',
    borderColor: 'border-[#00D2FF]/70',
    textColor: 'text-cyan-200',
    iconColor: '#00D2FF',
    ringColor: 'border-[#00D2FF] ring-[#00D2FF]/40 shadow-[0_0_15px_rgba(0,210,255,0.45)]',
    shadowGlow: 'shadow-[0_0_12px_rgba(0,210,255,0.35)]',
    minPoints: 200
  },
  GOLD: {
    tier: 'GOLD',
    label: 'Thành viên Vàng',
    badgeBg: 'bg-gradient-to-r from-[#FFD700]/30 via-[#F59E0B]/25 to-[#B45309]/45',
    borderColor: 'border-[#FBBF24]/90',
    textColor: 'text-[#FEF08A]',
    iconColor: '#FBBF24',
    ringColor: 'border-[#FBBF24] ring-[#FBBF24]/40 shadow-[0_0_18px_rgba(251,191,36,0.5)]',
    shadowGlow: 'shadow-[0_0_14px_rgba(245,158,11,0.45)]',
    minPoints: 500
  },
  DIAMOND: {
    tier: 'DIAMOND',
    label: 'Thành viên Kim Cương',
    badgeBg: 'bg-gradient-to-r from-[#C084FC]/30 via-[#A855F7]/25 to-[#6366F1]/50',
    borderColor: 'border-[#C084FC]/90',
    textColor: 'text-purple-200',
    iconColor: '#C084FC',
    ringColor: 'border-[#C084FC] ring-[#C084FC]/40 shadow-[0_0_18px_rgba(192,132,252,0.5)]',
    shadowGlow: 'shadow-[0_0_14px_rgba(168,85,247,0.45)]',
    minPoints: 1000
  }
};

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
