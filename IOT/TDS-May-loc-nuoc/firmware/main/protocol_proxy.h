#ifndef PROTOCOL_PROXY_H
#define PROTOCOL_PROXY_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "protocol_parser.h"

typedef void (*protocol_proxy_output_t)(void *context,
                                        const uint8_t *data,
                                        size_t length);

typedef bool (*protocol_proxy_modify_t)(void *context,
                                        uint8_t *frame,
                                        size_t length);

typedef struct {
    uint64_t bytes_received;
    uint64_t bytes_transmitted;
    uint32_t valid_frames;
    uint32_t modified_frames;
    uint32_t invalid_frames_forwarded;
    uint32_t partial_frames_forwarded;
} protocol_proxy_stats_t;

typedef struct {
    uint8_t buffer[PROTOCOL_MAX_FRAME_SIZE];
    size_t buffered;
    size_t expected_length;
    protocol_proxy_output_t output;
    protocol_proxy_modify_t modify;
    void *context;
    protocol_proxy_stats_t stats;
} protocol_proxy_t;

void protocol_proxy_init(protocol_proxy_t *proxy,
                         protocol_proxy_output_t output,
                         protocol_proxy_modify_t modify,
                         void *context);

void protocol_proxy_feed(protocol_proxy_t *proxy,
                         const uint8_t *data,
                         size_t length);

void protocol_proxy_on_gap(protocol_proxy_t *proxy);

const protocol_proxy_stats_t *
protocol_proxy_get_stats(const protocol_proxy_t *proxy);

#endif
