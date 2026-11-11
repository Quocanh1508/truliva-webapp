/**
 * Cấu hình quy chuẩn các dòng máy lọc nước Truliva, chu kỳ lõi lọc,
 * và logic tính toán trạng thái/chỉ báo (vạch & đèn) theo đặc tả kỹ thuật.
 */

export interface FilterDefinition {
  slot: number;
  code: string;            // 'PGP' | 'PCB' | 'RO' | 'CTO'
  name: string;            // 'Lõi 1 (PGP)' | 'Lõi 1 (PCB)' | 'Lõi 2 (RO)' | 'Lõi 3 (CTO)'
  description: string;
  lifespanDisplay: string; // '6 - 12 tháng' | '24 - 36 tháng' | '3 - 8 năm (36 - 96 tháng)'
  minMonths: number;
  maxMonths: number;
  isKey?: boolean;
}

export interface PurifierModelConfig {
  model: string;
  productLine: string;
  filterCount: 2 | 3;
  indicatorType: 'BARS' | 'LIGHT'; // 'BARS': Vạch xanh/đỏ (UR5676, UR5840) | 'LIGHT': Đèn trắng/đỏ (UR61096H)
  warrantyMonths: number;
  filters: FilterDefinition[];
}

export const PURIFIER_MODEL_CONFIGS: Record<string, PurifierModelConfig> = {
  // ── Dòng 3 lõi: Truliva UR5676 ──
  'UR5676': {
    model: 'UR5676',
    productLine: 'Máy lọc nước Truliva UR5676',
    filterCount: 3,
    indicatorType: 'BARS',
    warrantyMonths: 12,
    filters: [
      {
        slot: 1,
        code: 'PGP',
        name: 'Lõi 1 (PGP)',
        description: 'Lọc thô cặn bẩn & gỉ sét',
        lifespanDisplay: '6 - 12 tháng',
        minMonths: 6,
        maxMonths: 12
      },
      {
        slot: 2,
        code: 'RO',
        name: 'Lõi 2 (RO)',
        description: 'Màng lọc tinh RO 0.0001µm',
        lifespanDisplay: '24 - 36 tháng',
        minMonths: 24,
        maxMonths: 36,
        isKey: true
      },
      {
        slot: 3,
        code: 'CTO',
        name: 'Lõi 3 (CTO)',
        description: 'Khử mùi & vị than gáo dừa',
        lifespanDisplay: '6 - 12 tháng',
        minMonths: 6,
        maxMonths: 12
      }
    ]
  },

  // ── Dòng 3 lõi: Truliva UR5840 ──
  'UR5840': {
    model: 'UR5840',
    productLine: 'Máy lọc nước Delica UR5840',
    filterCount: 3,
    indicatorType: 'BARS',
    warrantyMonths: 24,
    filters: [
      {
        slot: 1,
        code: 'PGP',
        name: 'Lõi 1 (PGP)',
        description: 'Lọc thô cặn bẩn & gỉ sét',
        lifespanDisplay: '6 - 12 tháng',
        minMonths: 6,
        maxMonths: 12
      },
      {
        slot: 2,
        code: 'RO',
        name: 'Lõi 2 (RO)',
        description: 'Màng lọc tinh RO 0.0001µm',
        lifespanDisplay: '24 - 36 tháng',
        minMonths: 24,
        maxMonths: 36,
        isKey: true
      },
      {
        slot: 3,
        code: 'CTO',
        name: 'Lõi 3 (CTO)',
        description: 'Khử mùi & vị than gáo dừa',
        lifespanDisplay: '6 - 12 tháng',
        minMonths: 6,
        maxMonths: 12
      }
    ]
  },

  // ── Dòng 2 lõi: Truliva UR61096H ──
  'UR61096H': {
    model: 'UR61096H',
    productLine: 'Máy lọc nước Nóng Truliva UR61096H',
    filterCount: 2,
    indicatorType: 'LIGHT',
    warrantyMonths: 12,
    filters: [
      {
        slot: 1,
        code: 'PCB',
        name: 'Lõi 1 (PCB)',
        description: 'Bộ lọc phức hợp đa tầng (Polypropylene & Carbon Block)',
        lifespanDisplay: '6 - 12 tháng',
        minMonths: 6,
        maxMonths: 12
      },
      {
        slot: 2,
        code: 'RO',
        name: 'Lõi 2 (RO)',
        description: 'Màng lọc tinh RO',
        lifespanDisplay: '3 - 8 năm (36 - 96 tháng)',
        minMonths: 36,
        maxMonths: 96,
        isKey: true
      }
    ]
  }
};

/**
 * Trả về cấu hình dòng máy dựa trên Model / ProductLine / Serial
 */
export function getPurifierConfig(modelOrSerial?: string | null): PurifierModelConfig {
  if (!modelOrSerial) return PURIFIER_MODEL_CONFIGS['UR5840'];
  const upper = modelOrSerial.toUpperCase();
  if (upper.includes('61096')) return PURIFIER_MODEL_CONFIGS['UR61096H'];
  if (upper.includes('5676')) return PURIFIER_MODEL_CONFIGS['UR5676'];
  if (upper.includes('5840')) return PURIFIER_MODEL_CONFIGS['UR5840'];
  return PURIFIER_MODEL_CONFIGS['UR5840']; // Mặc định 3 lõi nếu chưa rõ dòng máy
}

/**
 * Mapping trạng thái & chỉ báo (Vạch / Đèn) theo đặc tả:
 * - Với dòng UR5676 / UR5840 (vạch):
 *   + > 25%: 2, 3, 4 vạch xanh -> "Đang tốt"
 *   + 10% - 25%: 1 vạch xanh -> "Sắp thay"
 *   + < 10%: 1 vạch nháy đỏ -> "Cần thay"
 * - Với dòng UR61096H / lõi PCB (đèn):
 *   + > 25%: PCB sáng đèn trắng -> "Đang tốt"
 *   + 10% - 25%: PCB sáng đèn trắng -> "Sắp thay"
 *   + < 10%: PCB nháy đèn đỏ -> "Cần thay"
 */
export function getFilterIndicatorStatus(
  percent?: number | null,
  isReplace?: boolean,
  indicatorType: 'BARS' | 'LIGHT' = 'BARS',
  customBars?: number | null
) {
  const val = percent ?? 80;

  if (isReplace || val < 10) {
    const indicator = indicatorType === 'LIGHT' ? 'Nháy đèn đỏ' : '1 vạch nháy đỏ';
    return {
      percent: val,
      status: 'Cần thay' as const,
      indicator,
      color: 'bg-rose-500',
      textColor: 'text-rose-600',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      severity: 'CRITICAL' as const,
      isReplace: true,
      bars: 1,
      isBlinking: true
    };
  }

  if (val <= 25) {
    const indicator = indicatorType === 'LIGHT' ? 'Sáng đèn trắng' : '1 vạch xanh';
    return {
      percent: val,
      status: 'Sắp thay' as const,
      indicator,
      color: 'bg-amber-500',
      textColor: 'text-amber-600',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      severity: 'WARNING' as const,
      isReplace: false,
      bars: 1,
      isBlinking: false
    };
  }

  // > 25%
  const calcBars = customBars ?? (val > 75 ? 4 : (val > 50 ? 3 : 2));
  const indicator = indicatorType === 'LIGHT' ? 'Sáng đèn trắng' : `${calcBars}/4 vạch xanh`;
  return {
    percent: val,
    status: 'Đang tốt' as const,
    indicator,
    color: 'bg-emerald-500',
    textColor: 'text-emerald-600',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    severity: 'INFO' as const,
    isReplace: false,
    bars: calcBars,
    isBlinking: false
  };
}

