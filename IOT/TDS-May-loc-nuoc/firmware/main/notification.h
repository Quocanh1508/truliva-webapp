#ifndef NOTIFICATION_H
#define NOTIFICATION_H

#include <stdint.h>

void notification_init(void);
void notification_update(uint16_t tds, uint8_t ppc,
                         uint8_t ro, uint8_t cto);

#endif
