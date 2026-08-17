#include <ctype.h>
#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

#include "driver/gpio.h"
#include "driver/uart.h"
#include "esp_console.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "filter_decode.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "notification.h"
#include "protocol_parser.h"
#include "protocol_proxy.h"
#include "sdkconfig.h"
#include "web_dashboard.h"

#define INPUT_GPIO       GPIO_NUM_27
#define OUTPUT_GPIO      GPIO_NUM_26
#define MODE_BUTTON_GPIO GPIO_NUM_0
#define SNIFFER_UART     UART_NUM_2
#define DATA_BAUD        9600
#define RX_BUFFER_SIZE   4096
#define TX_BUFFER_SIZE   4096
#define READ_BUFFER_SIZE 256
#define PACKET_GAP_MS    20

static const char *TAG = "TDS_UART";

typedef struct {
    bool valid;
    uint8_t length;
    uint8_t bytes[READ_BUFFER_SIZE];
} packet_snapshot_t;

static packet_snapshot_t snapshot_type_12;
static packet_snapshot_t snapshot_type_16;

typedef enum {
    OVERRIDE_PASS = 0,
    OVERRIDE_PPC,
    OVERRIDE_RO,
    OVERRIDE_CTO,
    OVERRIDE_ALL,
    OVERRIDE_MODE_COUNT,
} override_mode_t;

typedef struct {
    uint32_t packet_number;
    uint32_t error_number;
    uint32_t raw_number;
    int64_t last_valid_frame_us;
    volatile override_mode_t override_mode;
    volatile uint8_t override_value;
    volatile bool tds_override_enabled;
    volatile uint16_t tds_override_value;
    volatile bool override_log_pending;
} app_parser_context_t;

static app_parser_context_t *command_context;

static const char *override_mode_name(override_mode_t mode)
{
    switch (mode) {
    case OVERRIDE_PASS:
        return "PASS";
    case OVERRIDE_PPC:
        return "PPC";
    case OVERRIDE_RO:
        return "RO";
    case OVERRIDE_CTO:
        return "CTO";
    case OVERRIDE_ALL:
        return "ALL";
    default:
        return "UNKNOWN";
    }
}

static void proxy_output(void *context, const uint8_t *data, size_t length)
{
    (void)context;
    const int written = uart_write_bytes(SNIFFER_UART, data, length);
    if (written != (int)length) {
        ESP_LOGE(TAG, "Proxy TX short write: requested=%zu written=%d",
                 length, written);
    }
}

static bool proxy_modify(void *context, uint8_t *frame, size_t length)
{
    app_parser_context_t *app = context;
    if (length < 18 ||
        frame[0] != PROTOCOL_SYNC_BYTE || frame[2] != 0x16) {
        return false;
    }

    const override_mode_t mode = app->override_mode;
    const bool tds_enabled = app->tds_override_enabled;
    if (mode == OVERRIDE_PASS && !tds_enabled) {
        return false;
    }

    const uint8_t source_8 = frame[8];
    const uint8_t source_9 = frame[9];
    const uint8_t source_10 = frame[10];
    const uint16_t source_tds =
        (uint16_t)frame[14] | ((uint16_t)frame[15] << 8);

    const uint8_t value = app->override_value;
    switch (mode) {
    case OVERRIDE_PPC:
        frame[8] = value;
        break;
    case OVERRIDE_RO:
        frame[9] = value;
        break;
    case OVERRIDE_CTO:
        frame[10] = value;
        break;
    case OVERRIDE_ALL:
        frame[8] = value;
        frame[9] = value;
        frame[10] = value;
        break;
    case OVERRIDE_PASS:
        break;
    case OVERRIDE_MODE_COUNT:
        return false;
    }

    const uint16_t tds_value = app->tds_override_value;
    if (tds_enabled) {
        frame[14] = (uint8_t)(tds_value & 0xFF);
        frame[15] = (uint8_t)(tds_value >> 8);
        frame[16] = frame[14];
        frame[17] = frame[15];
    }

    if (app->override_log_pending) {
        printf("OVERRIDE | mode: %s | value: %u"
               " | TDS: %s:%u->%u"
               " | source[8,9,10]: %u,%u,%u"
               " | tx[8,9,10]: %u,%u,%u\n",
               override_mode_name(mode),
               value,
               tds_enabled ? "ON" : "OFF", source_tds,
               tds_enabled ? tds_value : source_tds,
               source_8, source_9, source_10,
               frame[8], frame[9], frame[10]);
        fflush(stdout);
        app->override_log_pending = false;
    }

    return frame[8] != source_8 || frame[9] != source_9 ||
           frame[10] != source_10 ||
           (tds_enabled && tds_value != source_tds);
}

static void cycle_override_mode(app_parser_context_t *app)
{
    app->override_mode =
        (override_mode_t)((app->override_mode + 1) % OVERRIDE_MODE_COUNT);
    app->override_log_pending = true;
    app->override_value = 0;
    app->tds_override_enabled = false;
    printf("PROXY_MODE | %s | value: %u\n",
           override_mode_name(app->override_mode), app->override_value);
    fflush(stdout);
}

static void set_override(override_mode_t mode, uint8_t value)
{
    if (command_context == NULL) {
        return;
    }
    command_context->override_value = value;
    command_context->override_log_pending = true;
    command_context->override_mode = mode;
    printf("PROXY_MODE | %s | value: %u\n",
           override_mode_name(mode), value);
    fflush(stdout);
}

static int command_pass(int argc, char **argv)
{
    (void)argc;
    (void)argv;
    if (command_context != NULL) {
        command_context->tds_override_enabled = false;
    }
    set_override(OVERRIDE_PASS, 0);
    return 0;
}

static int command_status(int argc, char **argv)
{
    (void)argc;
    (void)argv;
    if (command_context != NULL) {
        printf("PROXY_MODE | %s | value: %u | TDS_override: %s:%u\n",
               override_mode_name(command_context->override_mode),
               command_context->override_value,
               command_context->tds_override_enabled ? "ON" : "OFF",
               command_context->tds_override_value);
    }
    return 0;
}

static int command_set(int argc, char **argv)
{
    if (argc != 3) {
        printf("Usage: set <ppc|ro|cto|all> <0-100> OR set tds <0-999>\n");
        return 1;
    }

    char *end = NULL;
    const long value = strtol(argv[2], &end, 10);
    const bool is_tds = strcasecmp(argv[1], "tds") == 0;
    const long maximum = is_tds ? 999 : 100;
    if (end == argv[2] || *end != '\0' || value < 0 || value > maximum) {
        printf("Value must be an integer from 0 to %ld\n", maximum);
        return 1;
    }

    if (is_tds) {
        command_context->tds_override_value = (uint16_t)value;
        command_context->tds_override_enabled = true;
        command_context->override_log_pending = true;
        printf("TDS_OVERRIDE | value: %ld\n", value);
        return 0;
    }

    override_mode_t mode;
    if (strcasecmp(argv[1], "ppc") == 0) {
        mode = OVERRIDE_PPC;
    } else if (strcasecmp(argv[1], "ro") == 0) {
        mode = OVERRIDE_RO;
    } else if (strcasecmp(argv[1], "cto") == 0) {
        mode = OVERRIDE_CTO;
    } else if (strcasecmp(argv[1], "all") == 0) {
        mode = OVERRIDE_ALL;
    } else {
        printf("Unknown field; use ppc, ro, cto or all\n");
        return 1;
    }

    set_override(mode, (uint8_t)value);
    return 0;
}

static bool parse_filter_mode(const char *name, override_mode_t *mode)
{
    if (strcasecmp(name, "ppc") == 0) {
        *mode = OVERRIDE_PPC;
    } else if (strcasecmp(name, "ro") == 0) {
        *mode = OVERRIDE_RO;
    } else if (strcasecmp(name, "cto") == 0) {
        *mode = OVERRIDE_CTO;
    } else if (strcasecmp(name, "all") == 0) {
        *mode = OVERRIDE_ALL;
    } else {
        return false;
    }
    return true;
}

static int command_test(int argc, char **argv)
{
    if (argc != 4) {
        printf("Usage: test <ppc|ro|cto|all> <0-100> <tds 0-999>\n");
        return 1;
    }

    override_mode_t mode;
    if (!parse_filter_mode(argv[1], &mode)) {
        printf("Unknown field; use ppc, ro, cto or all\n");
        return 1;
    }
    char *filter_end = NULL;
    char *tds_end = NULL;
    const long filter_value = strtol(argv[2], &filter_end, 10);
    const long tds_value = strtol(argv[3], &tds_end, 10);
    if (filter_end == argv[2] || *filter_end != '\0' ||
        filter_value < 0 || filter_value > 100 ||
        tds_end == argv[3] || *tds_end != '\0' ||
        tds_value < 0 || tds_value > 999) {
        printf("Filter must be 0-100 and TDS must be 0-999\n");
        return 1;
    }

    command_context->tds_override_value = (uint16_t)tds_value;
    command_context->tds_override_enabled = true;
    set_override(mode, (uint8_t)filter_value);
    printf("TEST_CASE | field: %s | raw: %ld | TDS: %ld\n",
           override_mode_name(mode), filter_value, tds_value);
    return 0;
}

static void start_control_console(app_parser_context_t *context)
{
    command_context = context;
    const esp_console_cmd_t set_cmd = {
        .command = "set",
        .help = "Override filter raw value",
        .hint = "<ppc|ro|cto|all> <0-100>",
        .func = command_set,
    };
    const esp_console_cmd_t pass_cmd = {
        .command = "pass",
        .help = "Disable overrides and forward original data",
        .func = command_pass,
    };
    const esp_console_cmd_t test_cmd = {
        .command = "test",
        .help = "Set filter value and unique TDS test marker",
        .hint = "<ppc|ro|cto|all> <0-100> <tds 0-999>",
        .func = command_test,
    };
    const esp_console_cmd_t status_cmd = {
        .command = "status",
        .help = "Show current proxy mode",
        .func = command_status,
    };
    ESP_ERROR_CHECK(esp_console_cmd_register(&set_cmd));
    ESP_ERROR_CHECK(esp_console_cmd_register(&pass_cmd));
    ESP_ERROR_CHECK(esp_console_cmd_register(&test_cmd));
    ESP_ERROR_CHECK(esp_console_cmd_register(&status_cmd));

    esp_console_repl_config_t repl_config = ESP_CONSOLE_REPL_CONFIG_DEFAULT();
    repl_config.prompt = "tds> ";
    esp_console_dev_uart_config_t uart_config =
        ESP_CONSOLE_DEV_UART_CONFIG_DEFAULT();
    esp_console_repl_t *repl = NULL;
    ESP_ERROR_CHECK(esp_console_new_repl_uart(&uart_config,
                                              &repl_config, &repl));
    ESP_ERROR_CHECK(esp_console_start_repl(repl));
}

static void print_raw(uint32_t packet_number, const char *reason,
                      const uint8_t *data, size_t length)
{
    printf("RAW,packet,%" PRIu32 ",reason,%s,len,%zu,hex,",
           packet_number, reason, length);
    for (size_t i = 0; i < length; ++i) {
        printf("%02X", data[i]);
        if (i + 1 < length) {
            putchar(' ');
        }
    }

    printf(",ascii,");
    for (size_t i = 0; i < length; ++i) {
        putchar(isprint((unsigned char)data[i]) ? data[i] : '.');
    }
    putchar('\n');
    fflush(stdout);
}

static packet_snapshot_t *snapshot_for_type(uint8_t type)
{
    if (type == 0x12) {
        return &snapshot_type_12;
    }
    if (type == 0x16) {
        return &snapshot_type_16;
    }
    return NULL;
}

static bool track_changes(uint32_t packet_number, uint8_t type,
                          const uint8_t *data, size_t length)
{
    packet_snapshot_t *snapshot = snapshot_for_type(type);
    if (snapshot == NULL) {
        return true;
    }

    if (!snapshot->valid || snapshot->length != length) {
        printf("BASELINE,packet,%" PRIu32 ",type,0x%02X,indexed_hex,",
               packet_number, type);
        for (size_t i = 0; i < length; ++i) {
            printf("%02zu:%02X%s", i, data[i], i + 1 < length ? " " : "\n");
        }
        fflush(stdout);
        snapshot->valid = true;
        snapshot->length = (uint8_t)length;
        memcpy(snapshot->bytes, data, length);
        return true;
    }

    bool changed = false;
    /* CRC bytes change whenever payload changes, so omit them from CHANGE. */
    for (size_t i = 0; i + 2 < length; ++i) {
        if (snapshot->bytes[i] != data[i]) {
            printf("CHANGE,packet,%" PRIu32
                   ",type,0x%02X,offset,%zu,old,0x%02X,new,0x%02X\n",
                   packet_number, type, i, snapshot->bytes[i], data[i]);
            changed = true;
        }
    }
    if (changed) {
        memcpy(snapshot->bytes, data, length);
        fflush(stdout);
    }
    return changed;
}

static void print_bytes(uint32_t packet_number, const uint8_t *data, size_t length)
{
    if (length < 4 || data[0] != 0xAA || data[1] != length) {
        print_raw(packet_number, "UNFRAMED", data, length);
        return;
    }

    const uint16_t expected_crc =
        (uint16_t)data[length - 2] | ((uint16_t)data[length - 1] << 8);
    const uint16_t actual_crc = protocol_crc16_modbus(data, length - 2);
    const uint8_t type = data[2];

    if (actual_crc != expected_crc) {
        printf("PACKET,packet,%" PRIu32
               ",type,0x%02X,len,%zu,crc,BAD,expected,0x%04X,actual,0x%04X\n",
               packet_number, type, length, expected_crc, actual_crc);
        print_raw(packet_number, "CRC_BAD", data, length);
        return;
    }

    const bool changed = track_changes(packet_number, type, data, length);
    if (changed || type == 0x16) {
        printf("PACKET,packet,%" PRIu32
               ",type,0x%02X,len,%zu,status,0x%02X,crc,OK\n",
               packet_number, type, length, data[4]);
    }
    if (changed) {
        print_raw(packet_number, "CHANGED", data, length);
    }

    if (type == 0x16 && length >= 18) {
        const uint16_t tds =
            (uint16_t)data[14] | ((uint16_t)data[15] << 8);
        const uint16_t tds_secondary =
            (uint16_t)data[16] | ((uint16_t)data[17] << 8);
        const filter_indicator_t ppc = filter_decode_indicator(data[8]);
        const filter_indicator_t ro = filter_decode_indicator(data[9]);
        const filter_indicator_t cto = filter_decode_indicator(data[10]);
        notification_update(tds, data[8], data[9], data[10]);
        web_dashboard_update(tds, tds_secondary, data[8], data[9], data[10]);
        printf("DECODE,packet,%" PRIu32
               ",crc,OK,TDS,%u,mirror,%u,PPC_raw,%u,RO_raw,%u,CTO_raw,%u"
               ",PPC_bars,%u,PPC_color,%s,PPC_blink,%u"
               ",RO_bars,%u,RO_color,%s,RO_blink,%u"
               ",CTO_bars,%u,CTO_color,%s,CTO_blink,%u"
               ",status,0x%02X\n",
               packet_number, (unsigned)tds, (unsigned)tds_secondary,
               data[8], data[9], data[10],
               ppc.bars, filter_indicator_color(ppc),
               (unsigned)ppc.blinking,
               ro.bars, filter_indicator_color(ro),
               (unsigned)ro.blinking,
               cto.bars, filter_indicator_color(cto),
               (unsigned)cto.blinking,
               data[4]);
        printf("DISPLAY | TDS: %u ppm | Sensor 2: %u ppm"
               " | PPC: %u raw, %u bars, %s%s"
               " | RO: %u raw, %u bars, %s%s"
               " | CTO: %u raw, %u bars, %s%s"
               " | Status: 0x%02X | CRC: OK\n",
               (unsigned)tds, (unsigned)tds_secondary,
               data[8], ppc.bars, filter_indicator_color(ppc),
               ppc.blinking ? ", BLINK" : "",
               data[9], ro.bars, filter_indicator_color(ro),
               ro.blinking ? ", BLINK" : "",
               data[10], cto.bars, filter_indicator_color(cto),
               cto.blinking ? ", BLINK" : "",
               data[4]);
    }
    fflush(stdout);
}

static void on_valid_frame(void *context, const uint8_t *frame, size_t length)
{
    app_parser_context_t *app = context;
    app->packet_number++;
    app->last_valid_frame_us = esp_timer_get_time();
    print_bytes(app->packet_number, frame, length);
}

static void on_parser_error(void *context, protocol_error_t error,
                            const uint8_t *data, size_t length)
{
    app_parser_context_t *app = context;
    app->error_number++;
    printf("PARSER_ERROR,event,%" PRIu32 ",reason,%s,len,%zu\n",
           app->error_number, protocol_error_name(error), length);
    print_raw(app->error_number, protocol_error_name(error), data, length);
}

void app_main(void)
{
    const uart_config_t config = {
        .baud_rate = DATA_BAUD,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .rx_flow_ctrl_thresh = 0,
        .source_clk = UART_SCLK_DEFAULT,
    };

    ESP_ERROR_CHECK(uart_driver_install(SNIFFER_UART, RX_BUFFER_SIZE,
                                        TX_BUFFER_SIZE, 0,
                                        NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(SNIFFER_UART, &config));
    ESP_ERROR_CHECK(uart_set_pin(SNIFFER_UART,
                                 OUTPUT_GPIO,
                                 INPUT_GPIO,
                                 UART_PIN_NO_CHANGE,
                                 UART_PIN_NO_CHANGE));
    ESP_ERROR_CHECK(gpio_set_pull_mode(INPUT_GPIO, GPIO_FLOATING));

    const gpio_config_t button_config = {
        .pin_bit_mask = 1ULL << MODE_BUTTON_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&button_config));

    ESP_LOGI(TAG, "Inline UART proxy ready in safe PASS mode");
    ESP_LOGI(TAG, "Board DATA -> GPIO27 RX; GPIO26 TX -> display DATA");
    ESP_LOGI(TAG, "9600 baud, 8N1; press BOOT to cycle override mode");

    uint8_t data[READ_BUFFER_SIZE];
    app_parser_context_t app_context = {
        .last_valid_frame_us = esp_timer_get_time(),
    };
    start_control_console(&app_context);
    protocol_parser_t parser;
    protocol_parser_init(&parser, on_valid_frame, on_parser_error,
                         &app_context);
    protocol_proxy_t proxy;
    protocol_proxy_init(&proxy, proxy_output, proxy_modify, &app_context);
#ifdef CONFIG_TDS_NETWORK_ENABLED
    notification_init();
    web_dashboard_init();
#endif
    int64_t last_stats_us = esp_timer_get_time();
    int last_button_level = gpio_get_level(MODE_BUTTON_GPIO);
    int64_t last_button_press_us = 0;

    printf("PROXY_MODE | PASS | commands: test <field> <raw> <tds>;"
           " set <field> <value>; pass; status\n");
    fflush(stdout);

    while (true) {
        const int length = uart_read_bytes(SNIFFER_UART, data, sizeof(data),
                                           pdMS_TO_TICKS(PACKET_GAP_MS));
        if (length > 0) {
            /* Forward first; diagnostic printing must not delay the display. */
            protocol_proxy_feed(&proxy, data, (size_t)length);
            /* Forward non-AA traffic unchanged while parsing AA frames. */
            if (protocol_parser_is_idle(&parser) &&
                memchr(data, PROTOCOL_SYNC_BYTE, (size_t)length) == NULL) {
                print_raw(++app_context.raw_number, "UNFRAMED_CHUNK",
                          data, (size_t)length);
            }
            protocol_parser_feed(&parser, data, (size_t)length);
        } else {
            protocol_proxy_on_gap(&proxy);
            protocol_parser_on_gap(&parser);
        }

        const int64_t now_us = esp_timer_get_time();
        const int button_level = gpio_get_level(MODE_BUTTON_GPIO);
        if (last_button_level == 1 && button_level == 0 &&
            now_us - last_button_press_us >= 300000) {
            cycle_override_mode(&app_context);
            last_button_press_us = now_us;
        }
        last_button_level = button_level;

        if (now_us - last_stats_us >= 5000000) {
            const protocol_parser_stats_t *stats =
                protocol_parser_get_stats(&parser);
            printf("PARSER_STATS | bytes_received: %" PRIu64
                   " | frames_ok: %" PRIu32
                   " | crc_errors: %" PRIu32
                   " | length_errors: %" PRIu32
                   " | gap_resets: %" PRIu32
                   " | discarded_bytes: %" PRIu64 "\n",
                   stats->bytes_received, stats->frames_ok, stats->crc_errors,
                   stats->length_errors, stats->gap_resets,
                   stats->bytes_discarded);
            const protocol_proxy_stats_t *proxy_stats =
                protocol_proxy_get_stats(&proxy);
            printf("PROXY_STATS | mode: %s | value: %u"
                   " | tds_override: %s:%u | rx_bytes: %" PRIu64
                   " | tx_bytes: %" PRIu64
                   " | valid_frames: %" PRIu32
                   " | modified_frames: %" PRIu32
                   " | invalid_forwarded: %" PRIu32
                   " | partial_forwarded: %" PRIu32 "\n",
                   override_mode_name(app_context.override_mode),
                   app_context.override_value,
                   app_context.tds_override_enabled ? "ON" : "OFF",
                   app_context.tds_override_value,
                   proxy_stats->bytes_received,
                   proxy_stats->bytes_transmitted,
                   proxy_stats->valid_frames,
                   proxy_stats->modified_frames,
                   proxy_stats->invalid_frames_forwarded,
                   proxy_stats->partial_frames_forwarded);
            if (now_us - app_context.last_valid_frame_us >= 5000000) {
                ESP_LOGW(TAG, "No valid AA frame for 5 s; GPIO27 level=%d",
                         gpio_get_level(INPUT_GPIO));
            }
            last_stats_us = now_us;
        }
    }
}
