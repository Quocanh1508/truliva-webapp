import { extractModelCodes } from './memoryManager';
import { AgentIntent, ToolName } from './types';

export interface RoutePlan {
  intent: AgentIntent;
  detectedModels: string[];
  primaryModel: string;
  toolsToRun: ToolName[];
  ragQuery: string;
  allowHotlineEscalation: boolean;
}

// Sử dụng ranh giới Unicode thay cho \b vì \b trong JS không nhận diện đúng ký tự có dấu tiếng Việt
const INQUIRY_DOMAIN_KEYWORD_RE =
  /(?:^|[^\p{L}\p{N}])(giá|bao\s*nhiêu|thông\s*số|kích\s*thước|công\s*suất|bảo\s*hành|kích\s*hoạt|serial|lõi|màng|ro|thay|sửa|lỗi|rò|chảy|xì|kêu|hỏng|tư\s*vấn|hỏi|cho\s*xin|mua|đặt|combo|khuyến\s*mãi|ưu\s*đãi|voucher|giảm|đổi|trả|địa\s*chỉ|hotline|tổng\s*đài|số\s*điện\s*thoại|liên\s*hệ|còn\s*hàng|máy|vòi|bơm|tds|wifi|iot|lắp)(?=$|[^\p{L}\p{N}])/iu;

const PURE_GREETING_PHRASE_RE =
  /^(?:xin\s+chào|chào|alo|hi|hello|hey|cảm\s+ơn|cám\s+ơn|thanks|thank\s+you|tks|ok|oki|oke|okay|dạ|vâng|ừ|tuyệt|tốt\s+quá|bye|tạm\s+biệt|shop|ad|admin|truliva|em|anh|chị|bạn|ơi|nhé|nha|ạ|rồi|\s)+$/iu;

const URGENT_TROUBLESHOOT_RE =
  /(?:rò\s*(?:rỉ|nước)|chảy\s*nước|xì\s*nước|chập\s*điện|mùi\s*khét|bốc\s*khói|kêu\s*to|không\s*ra\s*nước|báo\s*lỗi|mã\s*lỗi|sửa\s*gấp|cần\s*thợ)/iu;

const WARRANTY_CONTACT_RE =
  /(?:bảo\s*hành|kích\s*hoạt|serial|đổi\s*trả|địa\s*chỉ|hotline|tổng\s*đài|giờ\s*làm\s*việc|liên\s*hệ)/iu;

const PRICE_SPEC_RE =
  /(?:giá|bao\s*nhiêu|thông\s*số|kích\s*thước|công\s*suất|mua|đặt|combo|ưu\s*đãi|lõi|màng|vòi)/iu;

function isPureGreetingOrChitchat(cleanText: string, imageCount: number, detectedModels: string[]): boolean {
  if (imageCount > 0) return false;
  if (!cleanText || cleanText.length > 40) return false;
  if (/[?？]/.test(cleanText)) return false;
  if (detectedModels.length > 0) return false;
  if (INQUIRY_DOMAIN_KEYWORD_RE.test(cleanText)) return false;

  const strippedPunctuation = cleanText
    .replace(/[!.,~…:;'"()\[\]{}\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!strippedPunctuation) return false;
  return PURE_GREETING_PHRASE_RE.test(strippedPunctuation);
}

/**
 * Phân loại ý định & lập kế hoạch công cụ tối thiểu cho lượt hội thoại.
 */
export function routeIntent(params: {
  text: string;
  imageCount: number;
  activeModels: string[];
  blocked?: boolean;
}): RoutePlan {
  const cleanText = (params.text || '').trim();
  const detectedModels = extractModelCodes(cleanText);
  const primaryModel =
    detectedModels[detectedModels.length - 1] ||
    params.activeModels[params.activeModels.length - 1] ||
    '';

  if (params.blocked) {
    return {
      intent: 'INJECTION_BLOCKED',
      detectedModels,
      primaryModel,
      toolsToRun: [],
      ragQuery: '',
      allowHotlineEscalation: false,
    };
  }

  if (isPureGreetingOrChitchat(cleanText, params.imageCount, detectedModels)) {
    return {
      intent: 'GREETING_CHITCHAT',
      detectedModels,
      primaryModel,
      toolsToRun: [],
      ragQuery: '',
      allowHotlineEscalation: false,
    };
  }

  let ragQuery = cleanText;
  if (!ragQuery && params.imageCount > 0) {
    ragQuery = primaryModel
      ? `${primaryModel} thông số giá bán bảo hành`
      : 'Máy lọc nước Truliva bảng giá thông số';
  } else if (primaryModel && !ragQuery.toUpperCase().includes(primaryModel)) {
    ragQuery = `${primaryModel} ${ragQuery}`;
  }

  if (params.imageCount > 0) {
    return {
      intent: 'VISUAL_INQUIRY',
      detectedModels,
      primaryModel,
      toolsToRun: ['lookup_catalog', 'search_rag', 'match_faq'],
      ragQuery,
      allowHotlineEscalation: URGENT_TROUBLESHOOT_RE.test(cleanText),
    };
  }

  if (URGENT_TROUBLESHOOT_RE.test(cleanText)) {
    return {
      intent: 'TROUBLESHOOT_URGENT',
      detectedModels,
      primaryModel,
      toolsToRun: ['search_rag', 'match_faq', 'lookup_catalog'],
      ragQuery,
      allowHotlineEscalation: true,
    };
  }

  if (WARRANTY_CONTACT_RE.test(cleanText) && !PRICE_SPEC_RE.test(cleanText)) {
    return {
      intent: 'WARRANTY_POLICY_CONTACT',
      detectedModels,
      primaryModel,
      toolsToRun: ['match_faq', 'search_rag', 'lookup_catalog'],
      ragQuery,
      allowHotlineEscalation: false,
    };
  }

  if (PRICE_SPEC_RE.test(cleanText) || detectedModels.length > 0) {
    return {
      intent: 'PRODUCT_PRICE_SPEC',
      detectedModels,
      primaryModel,
      toolsToRun: ['lookup_catalog', 'search_rag', 'match_faq'],
      ragQuery,
      allowHotlineEscalation: false,
    };
  }

  return {
    intent: 'GENERAL_INQUIRY',
    detectedModels,
    primaryModel,
    toolsToRun: ['lookup_catalog', 'search_rag', 'match_faq'],
    ragQuery,
    allowHotlineEscalation: false,
  };
}
