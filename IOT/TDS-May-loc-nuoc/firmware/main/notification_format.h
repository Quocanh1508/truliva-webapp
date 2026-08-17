#ifndef NOTIFICATION_FORMAT_H
#define NOTIFICATION_FORMAT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

bool notification_format_json(char *output, size_t capacity,
                              const char *chat_id, unsigned interval_seconds,
                              uint16_t tds, uint8_t ppc,
                              uint8_t ro, uint8_t cto);

#endif
