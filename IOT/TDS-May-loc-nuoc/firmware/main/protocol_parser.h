#ifndef PROTOCOL_PARSER_H
#define PROTOCOL_PARSER_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define PROTOCOL_SYNC_BYTE       0xAA
#define PROTOCOL_MIN_FRAME_SIZE  5
#define PROTOCOL_MAX_FRAME_SIZE  128

typedef enum {
    PROTOCOL_ERROR_INVALID_LENGTH,
    PROTOCOL_ERROR_CRC_MISMATCH,
    PROTOCOL_ERROR_PARTIAL_FRAME_GAP,
} protocol_error_t;

typedef struct {
    uint64_t bytes_received;
    uint64_t bytes_discarded;
    uint32_t frames_ok;
    uint32_t crc_errors;
    uint32_t length_errors;
    uint32_t gap_resets;
} protocol_parser_stats_t;

typedef void (*protocol_frame_callback_t)(void *context,
                                          const uint8_t *frame,
                                          size_t length);

typedef void (*protocol_error_callback_t)(void *context,
                                          protocol_error_t error,
                                          const uint8_t *data,
                                          size_t length);

typedef struct {
    uint8_t buffer[PROTOCOL_MAX_FRAME_SIZE];
    size_t buffered;
    size_t expected_length;
    protocol_frame_callback_t on_frame;
    protocol_error_callback_t on_error;
    void *callback_context;
    protocol_parser_stats_t stats;
} protocol_parser_t;

void protocol_parser_init(protocol_parser_t *parser,
                          protocol_frame_callback_t on_frame,
                          protocol_error_callback_t on_error,
                          void *callback_context);

void protocol_parser_feed(protocol_parser_t *parser,
                          const uint8_t *data,
                          size_t length);

void protocol_parser_on_gap(protocol_parser_t *parser);

bool protocol_parser_is_idle(const protocol_parser_t *parser);

const protocol_parser_stats_t *
protocol_parser_get_stats(const protocol_parser_t *parser);

uint16_t protocol_crc16_modbus(const uint8_t *data, size_t length);

const char *protocol_error_name(protocol_error_t error);

#ifdef __cplusplus
}
#endif

#endif
