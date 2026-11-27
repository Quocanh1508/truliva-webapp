export interface FaqEntry {
  category?: string;
  question: string;
  answer: string;
}

export interface FaqToolOutput {
  faqText: string;
  matchedCount: number;
}

function tokenizeVietnamese(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Lọc các FAQ liên quan nhất với câu hỏi thay vì nhồi toàn bộ danh sách lớn vào prompt.
 */
export function matchRelevantFaqs(params: {
  query: string;
  primaryModel?: string;
  faqs: FaqEntry[];
  maxItems?: number;
}): FaqToolOutput {
  const allFaqs = Array.isArray(params.faqs)
    ? params.faqs.filter((f) => f && f.question && f.answer)
    : [];

  if (allFaqs.length === 0) {
    return { faqText: '', matchedCount: 0 };
  }

  const maxItems = params.maxItems ?? 6;
  if (allFaqs.length <= maxItems) {
    const faqText =
      '\nCÂU HỎI THƯỜNG GẶP (FAQ CHUẨN):\n' +
      allFaqs.map((f) => `Hỏi: ${f.question}\nĐáp: ${f.answer}`).join('\n\n');
    return { faqText, matchedCount: allFaqs.length };
  }

  const queryTokens = new Set(tokenizeVietnamese(params.query));
  const modelUpper = (params.primaryModel || '').toUpperCase();

  const scored = allFaqs.map((faq, index) => {
    let score = 0;
    const combinedUpper = `${faq.question} ${faq.answer}`.toUpperCase();
    if (modelUpper && combinedUpper.includes(modelUpper)) {
      score += 5;
    }

    const faqTokens = tokenizeVietnamese(`${faq.category || ''} ${faq.question}`);
    for (const tok of faqTokens) {
      if (queryTokens.has(tok)) {
        score += 1;
      }
    }

    return { faq, score, index };
  });

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));
  const selected = scored.filter((s) => s.score > 0).slice(0, maxItems);
  const finalList = (selected.length > 0 ? selected : scored.slice(0, maxItems)).map((s) => s.faq);

  const faqText =
    '\nCÂU HỎI THƯỜNG GẶP (FAQ CHUẨN):\n' +
    finalList.map((f) => `Hỏi: ${f.question}\nĐáp: ${f.answer}`).join('\n\n');

  return { faqText, matchedCount: finalList.length };
}
