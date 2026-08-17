#ifndef FILTER_DECODE_H
#define FILTER_DECODE_H

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    uint8_t bars;
    bool red;
    bool blinking;
} filter_indicator_t;

filter_indicator_t filter_decode_indicator(uint8_t raw_value);
const char *filter_indicator_color(filter_indicator_t indicator);

#endif
