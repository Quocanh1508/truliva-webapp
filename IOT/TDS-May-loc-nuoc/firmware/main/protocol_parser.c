#include "protocol_parser.h"

#include <string.h>

uint16_t protocol_crc16_modbus(const uint8_t *data, size_t length)
{
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < length; ++i) {
        crc ^= data[i];
        for (unsigned bit = 0; bit < 8; ++bit) {
            crc = (crc & 1U) ? (uint16_t)((crc >> 1) ^ 0xA001U)
                             : (uint16_t)(crc >> 1);
        }
    }
    return crc;
}

const char *protocol_error_name(protocol_error_t error)
{
    switch (error) {
    case PROTOCOL_ERROR_INVALID_LENGTH:
        return "INVALID_LENGTH";
    case PROTOCOL_ERROR_CRC_MISMATCH:
        return "CRC_MISMATCH";
    case PROTOCOL_ERROR_PARTIAL_FRAME_GAP:
        return "PARTIAL_FRAME_GAP";
    default:
        return "UNKNOWN";
    }
}

static void parser_reset_frame(protocol_parser_t *parser)
{
    parser->buffered = 0;
    parser->expected_length = 0;
}

void protocol_parser_init(protocol_parser_t *parser,
                          protocol_frame_callback_t on_frame,
                          protocol_error_callback_t on_error,
                          void *callback_context)
{
    memset(parser, 0, sizeof(*parser));
    parser->on_frame = on_frame;
    parser->on_error = on_error;
    parser->callback_context = callback_context;
}

static void report_error(protocol_parser_t *parser,
                         protocol_error_t error,
                         const uint8_t *data,
                         size_t length)
{
    if (parser->on_error != NULL) {
        parser->on_error(parser->callback_context, error, data, length);
    }
}

static void process_byte(protocol_parser_t *parser, uint8_t byte,
                         bool count_received);

static void recover_from_bad_frame(protocol_parser_t *parser,
                                   const uint8_t *frame,
                                   size_t length)
{
    /*
     * The first sync byte belongs to the rejected frame. Replay everything
     * after it: a later 0xAA may already be the start of the next valid frame.
     */
    parser->stats.bytes_discarded++;
    parser_reset_frame(parser);
    for (size_t i = 1; i < length; ++i) {
        process_byte(parser, frame[i], false);
    }
}

static void process_byte(protocol_parser_t *parser, uint8_t byte,
                         bool count_received)
{
    if (count_received) {
        parser->stats.bytes_received++;
    }

    if (parser->buffered == 0) {
        if (byte == PROTOCOL_SYNC_BYTE) {
            parser->buffer[0] = byte;
            parser->buffered = 1;
        } else {
            parser->stats.bytes_discarded++;
        }
        return;
    }

    if (parser->buffered == 1) {
        if (byte < PROTOCOL_MIN_FRAME_SIZE ||
            byte > PROTOCOL_MAX_FRAME_SIZE) {
            uint8_t rejected[2] = {PROTOCOL_SYNC_BYTE, byte};
            parser->stats.length_errors++;
            report_error(parser, PROTOCOL_ERROR_INVALID_LENGTH,
                         rejected, sizeof(rejected));

            parser->stats.bytes_discarded++;
            if (byte == PROTOCOL_SYNC_BYTE) {
                parser->buffer[0] = byte;
                parser->buffered = 1;
                parser->expected_length = 0;
            } else {
                parser->stats.bytes_discarded++;
                parser_reset_frame(parser);
            }
            return;
        }

        parser->buffer[1] = byte;
        parser->buffered = 2;
        parser->expected_length = byte;
        return;
    }

    parser->buffer[parser->buffered++] = byte;
    if (parser->buffered < parser->expected_length) {
        return;
    }

    const size_t frame_length = parser->expected_length;
    const uint16_t expected_crc =
        (uint16_t)parser->buffer[frame_length - 2] |
        ((uint16_t)parser->buffer[frame_length - 1] << 8);
    const uint16_t actual_crc =
        protocol_crc16_modbus(parser->buffer, frame_length - 2);

    if (actual_crc == expected_crc) {
        parser->stats.frames_ok++;
        if (parser->on_frame != NULL) {
            parser->on_frame(parser->callback_context,
                             parser->buffer, frame_length);
        }
        parser_reset_frame(parser);
        return;
    }

    uint8_t rejected[PROTOCOL_MAX_FRAME_SIZE];
    memcpy(rejected, parser->buffer, frame_length);
    parser->stats.crc_errors++;
    report_error(parser, PROTOCOL_ERROR_CRC_MISMATCH,
                 rejected, frame_length);
    recover_from_bad_frame(parser, rejected, frame_length);
}

void protocol_parser_feed(protocol_parser_t *parser,
                          const uint8_t *data,
                          size_t length)
{
    if (parser == NULL || (data == NULL && length != 0)) {
        return;
    }
    for (size_t i = 0; i < length; ++i) {
        process_byte(parser, data[i], true);
    }
}

void protocol_parser_on_gap(protocol_parser_t *parser)
{
    if (parser == NULL || parser->buffered == 0) {
        return;
    }

    report_error(parser, PROTOCOL_ERROR_PARTIAL_FRAME_GAP,
                 parser->buffer, parser->buffered);
    parser->stats.gap_resets++;
    parser->stats.bytes_discarded += parser->buffered;
    parser_reset_frame(parser);
}

bool protocol_parser_is_idle(const protocol_parser_t *parser)
{
    return parser == NULL || parser->buffered == 0;
}

const protocol_parser_stats_t *
protocol_parser_get_stats(const protocol_parser_t *parser)
{
    return parser == NULL ? NULL : &parser->stats;
}
