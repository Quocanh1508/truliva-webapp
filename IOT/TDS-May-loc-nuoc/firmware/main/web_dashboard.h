#ifndef WEB_DASHBOARD_H
#define WEB_DASHBOARD_H

#include <stdint.h>

void web_dashboard_init(void);
void web_dashboard_update(uint16_t tds, uint16_t tds_mirror,
                          uint8_t ppc, uint8_t ro, uint8_t cto);

#endif
