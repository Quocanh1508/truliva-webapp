#include "notification_format.h"

#include <stdio.h>

#include "filter_decode.h"

static const char *filter_state(filter_indicator_t indicator)
{
    if (indicator.red) {
        return "Cần thay lõi ngay";
    }
    switch (indicator.bars) {
    case 1:
        return "Mức thấp";
    case 2:
        return "Cần theo dõi";
    case 3:
        return "Khá";
    default:
        return "Tốt";
    }
}

bool notification_format_json(char *output, size_t capacity,
                              const char *chat_id, unsigned interval_seconds,
                              uint16_t tds, uint8_t ppc_raw,
                              uint8_t ro_raw, uint8_t cto_raw)
{
    if (output == NULL || capacity == 0 || chat_id == NULL) {
        return false;
    }
    const filter_indicator_t ppc = filter_decode_indicator(ppc_raw);
    const filter_indicator_t ro = filter_decode_indicator(ro_raw);
    const filter_indicator_t cto = filter_decode_indicator(cto_raw);

    const int length = snprintf(
        output, capacity,
        "{\"chat_id\":\"%s\",\"text\":\""
        "BÁO CÁO MÁY LỌC NƯỚC\\n\\n"
        "Chất lượng nước\\n"
        "TDS: %u ppm\\n\\n"
        "Tình trạng lõi lọc\\n"
        "PPC: %u%% còn lại | %u/4 vạch | %s\\n"
        "RO: %u%% còn lại | %u/4 vạch | %s\\n"
        "CTO: %u%% còn lại | %u/4 vạch | %s\\n\\n"
        "Chu kỳ cập nhật: %u giây\\n"
        "----------------------\"}",
        chat_id, tds,
        ppc_raw, ppc.bars, filter_state(ppc),
        ro_raw, ro.bars, filter_state(ro),
        cto_raw, cto.bars, filter_state(cto),
        interval_seconds);
    return length >= 0 && (size_t)length < capacity;
}
