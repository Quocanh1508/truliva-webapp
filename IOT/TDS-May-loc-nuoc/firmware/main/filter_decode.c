#include "filter_decode.h"

filter_indicator_t filter_decode_indicator(uint8_t raw_value)
{
    if (raw_value <= 2) {
        return (filter_indicator_t){
            .bars = 1,
            .red = true,
            .blinking = true,
        };
    }
    if (raw_value <= 24) {
        return (filter_indicator_t){.bars = 1};
    }
    if (raw_value <= 49) {
        return (filter_indicator_t){.bars = 2};
    }
    if (raw_value <= 74) {
        return (filter_indicator_t){.bars = 3};
    }
    return (filter_indicator_t){.bars = 4};
}

const char *filter_indicator_color(filter_indicator_t indicator)
{
    return indicator.red ? "RED" : "GREEN";
}
