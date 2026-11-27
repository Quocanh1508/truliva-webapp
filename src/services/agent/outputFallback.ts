import { OFFICIAL_TRULIVA_HOTLINE } from './promptBuilder';
import { AgentIntent } from './types';

const LEAKED_SECTION_MARKERS = [
  /\[SYSTEM_INSTRUCTION\][\s\S]*$/i,
  /BẢNG GIÁ & DANH MỤC SẢN PHẨM TRULIVA CHÍNH THỨC:[\s\S]*$/i,
  /TÀI LIỆU CHÍNH HÃNG TRULIVA TRA CỨU ĐƯỢC \(HYBRID RAG\):[\s\S]*$/i,
];

const REPETITIVE_GREETING_RE =
  /^Dạ\s+Truliva\s+(?:Pure\s+Vita\s+)?xin\s+chào\s+(?:anh\/chị|anh\s+chị|bạn|quý\s+khách)[!,. ]*\s*/i;

/**
 * Hậu kiểm câu trả lời LLM: lọc rò rỉ marker hệ thống và bỏ lời chào lặp ở lượt > 1.
 */
export function sanitizeAgentOutput(rawReply: string, turnCount: number): string {
  let clean = (rawReply || '').trim();
  if (!clean) return '';

  for (const marker of LEAKED_SECTION_MARKERS) {
    clean = clean.replace(marker, '').trim();
  }

  if (turnCount > 0) {
    const stripped = clean.replace(REPETITIVE_GREETING_RE, '').trim();
    if (stripped.length >= 12) {
      clean = stripped.charAt(0).toUpperCase() + stripped.slice(1);
    }
  }

  return clean;
}

/**
 * Sinh phản hồi dự phòng lịch sự theo ngữ cảnh Intent (không bao giờ trả rỗng hoặc 500).
 */
export function buildFallbackReply(params: {
  intent: AgentIntent;
  reason?: string;
  hotline?: string;
}): string {
  const hotline = params.hotline || OFFICIAL_TRULIVA_HOTLINE;

  if (params.intent === 'INJECTION_BLOCKED') {
    return 'Dạ em là Trợ lý AI tư vấn máy lọc nước và dịch vụ chăm sóc khách hàng của Truliva. Anh/chị cần tư vấn dòng máy, giá bán hay hỗ trợ bảo hành có thể nhắn thông tin để em hỗ trợ ngay nhé!';
  }

  if (params.intent === 'TROUBLESHOOT_URGENT') {
    return `Dạ với sự cố kỹ thuật khẩn cấp trên máy lọc nước, anh/chị vui lòng tạm khóa van nước cấp đầu vào và ngắt nguồn điện của máy để đảm bảo an toàn, sau đó liên hệ ngay Hotline kỹ thuật Truliva ${hotline} để được điều phối kỹ thuật viên hỗ trợ sớm nhất ạ!`;
  }

  return 'Dạ Truliva đã ghi nhận câu hỏi của anh/chị. Hiện kết nối tra cứu tự động đang bận trong giây lát, anh/chị vui lòng nhắn lại sau ít phút hoặc để lại Số điện thoại để chuyên viên Truliva tư vấn chi tiết ngay nhé!';
}
