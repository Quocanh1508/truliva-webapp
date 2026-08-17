#include "protocol_proxy.h"

#include <string.h>

static void reset_candidate(protocol_proxy_t *proxy)
{
    proxy->buffered = 0;
    proxy->expected_length = 0;
}

static void transmit(protocol_proxy_t *proxy,
                     const uint8_t *data,
                     size_t length)
{
    if (length == 0) {
        return;
    }
    if (proxy->output != NULL) {
        proxy->output(proxy->context, data, length);
    }
    proxy->stats.bytes_transmitted += length;
}

static void process_byte(protocol_proxy_t *proxy, uint8_t byte,
                         bool count_received)
{
    if (count_received) {
        proxy->stats.bytes_received++;
    }

    if (proxy->buffered == 0) {
        if (byte == PROTOCOL_SYNC_BYTE) {
            proxy->buffer[0] = byte;
            proxy->buffered = 1;
        } else {
            transmit(proxy, &byte, 1);
        }
        return;
    }

    if (proxy->buffered == 1) {
        if (byte < PROTOCOL_MIN_FRAME_SIZE ||
            byte > PROTOCOL_MAX_FRAME_SIZE) {
            const uint8_t sync = proxy->buffer[0];
            reset_candidate(proxy);
            transmit(proxy, &sync, 1);
            process_byte(proxy, byte, false);
            return;
        }
        proxy->buffer[1] = byte;
        proxy->buffered = 2;
        proxy->expected_length = byte;
        return;
    }

    proxy->buffer[proxy->buffered++] = byte;
    if (proxy->buffered < proxy->expected_length) {
        return;
    }

    const size_t frame_length = proxy->expected_length;
    const uint16_t expected_crc =
        (uint16_t)proxy->buffer[frame_length - 2] |
        ((uint16_t)proxy->buffer[frame_length - 1] << 8);
    const uint16_t actual_crc =
        protocol_crc16_modbus(proxy->buffer, frame_length - 2);

    if (actual_crc != expected_crc) {
        proxy->stats.invalid_frames_forwarded++;
        transmit(proxy, proxy->buffer, frame_length);
        reset_candidate(proxy);
        return;
    }

    proxy->stats.valid_frames++;
    const bool modified =
        proxy->modify != NULL &&
        proxy->modify(proxy->context, proxy->buffer, frame_length);
    if (modified) {
        const uint16_t crc =
            protocol_crc16_modbus(proxy->buffer, frame_length - 2);
        proxy->buffer[frame_length - 2] = (uint8_t)(crc & 0xFF);
        proxy->buffer[frame_length - 1] = (uint8_t)(crc >> 8);
        proxy->stats.modified_frames++;
    }

    transmit(proxy, proxy->buffer, frame_length);
    reset_candidate(proxy);
}

void protocol_proxy_init(protocol_proxy_t *proxy,
                         protocol_proxy_output_t output,
                         protocol_proxy_modify_t modify,
                         void *context)
{
    memset(proxy, 0, sizeof(*proxy));
    proxy->output = output;
    proxy->modify = modify;
    proxy->context = context;
}

void protocol_proxy_feed(protocol_proxy_t *proxy,
                         const uint8_t *data,
                         size_t length)
{
    if (proxy == NULL || (data == NULL && length != 0)) {
        return;
    }
    for (size_t i = 0; i < length; ++i) {
        process_byte(proxy, data[i], true);
    }
}

void protocol_proxy_on_gap(protocol_proxy_t *proxy)
{
    if (proxy == NULL || proxy->buffered == 0) {
        return;
    }
    transmit(proxy, proxy->buffer, proxy->buffered);
    proxy->stats.partial_frames_forwarded++;
    reset_candidate(proxy);
}

const protocol_proxy_stats_t *
protocol_proxy_get_stats(const protocol_proxy_t *proxy)
{
    return proxy == NULL ? NULL : &proxy->stats;
}
