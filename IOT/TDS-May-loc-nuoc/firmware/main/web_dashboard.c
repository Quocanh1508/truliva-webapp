#include "web_dashboard.h"

#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

#define HISTORY_SIZE 180
#define HISTORY_INTERVAL_MS 5000

typedef struct {
    uint32_t seq;
    int64_t ms;
    uint16_t tds;
    uint8_t ppc;
    uint8_t ro;
    uint8_t cto;
} history_sample_t;

typedef struct {
    bool ready;
    uint32_t seq;
    int64_t updated_ms;
    uint16_t tds;
    uint16_t mirror;
    uint8_t ppc;
    uint8_t ro;
    uint8_t cto;
} latest_sample_t;

extern const uint8_t dashboard_html_start[] asm("_binary_dashboard_html_start");
extern const uint8_t dashboard_html_end[] asm("_binary_dashboard_html_end");

static const char *TAG = "WATER_WEB";
static SemaphoreHandle_t data_mutex;
static latest_sample_t latest;
static history_sample_t history[HISTORY_SIZE];
static size_t history_count;
static size_t history_head;
static int64_t history_last_ms;

static void no_cache(httpd_req_t *req)
{
    httpd_resp_set_hdr(req, "Cache-Control", "no-store, no-cache, must-revalidate");
}

static esp_err_t dashboard_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
    return httpd_resp_send(req, (const char *)dashboard_html_start,
                           dashboard_html_end - dashboard_html_start);
}

static esp_err_t latest_handler(httpd_req_t *req)
{
    latest_sample_t sample = {0};
    if (xSemaphoreTake(data_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        sample = latest;
        xSemaphoreGive(data_mutex);
    }
    const int64_t now_ms = esp_timer_get_time() / 1000;
    const int64_t age_ms = sample.ready ? now_ms - sample.updated_ms : -1;
    char json[360];
    if (!sample.ready) {
        snprintf(json, sizeof(json),
                 "{\"ready\":false,\"dataOnline\":false,\"wifiOnline\":true}");
    } else {
        snprintf(json, sizeof(json),
                 "{\"ready\":true,\"dataOnline\":%s,\"wifiOnline\":true,"
                 "\"seq\":%" PRIu32 ",\"ageMs\":%" PRId64 ",\"tds\":%u,"
                 "\"mirror\":%u,\"ppc\":%u,\"ro\":%u,\"cto\":%u}",
                 age_ms < 10000 ? "true" : "false", sample.seq, age_ms,
                 sample.tds, sample.mirror, sample.ppc, sample.ro, sample.cto);
    }
    httpd_resp_set_type(req, "application/json");
    no_cache(req);
    return httpd_resp_sendstr(req, json);
}

static esp_err_t history_handler(httpd_req_t *req)
{
    if (xSemaphoreTake(data_mutex, pdMS_TO_TICKS(200)) != pdTRUE) {
        httpd_resp_set_status(req, "503 Service Unavailable");
        return httpd_resp_sendstr(req, "Du lieu dang ban");
    }
    history_sample_t copy[HISTORY_SIZE];
    const size_t count = history_count;
    const size_t start = (history_head + HISTORY_SIZE - count) % HISTORY_SIZE;
    for (size_t i = 0; i < count; ++i) {
        copy[i] = history[(start + i) % HISTORY_SIZE];
    }
    xSemaphoreGive(data_mutex);

    httpd_resp_set_type(req, "application/json");
    no_cache(req);
    esp_err_t err = httpd_resp_send_chunk(req, "{\"samples\":[",
                                              HTTPD_RESP_USE_STRLEN);
    char item[128];
    for (size_t i = 0; err == ESP_OK && i < count; ++i) {
        const int length = snprintf(
            item, sizeof(item),
            "%s{\"seq\":%" PRIu32 ",\"ms\":%" PRId64
            ",\"tds\":%u,\"ppc\":%u,\"ro\":%u,\"cto\":%u}",
            i ? "," : "", copy[i].seq, copy[i].ms, copy[i].tds,
            copy[i].ppc, copy[i].ro, copy[i].cto);
        err = httpd_resp_send_chunk(req, item, length);
    }
    if (err == ESP_OK) err = httpd_resp_send_chunk(req, "]}", 2);
    if (err == ESP_OK) err = httpd_resp_send_chunk(req, NULL, 0);
    return err;
}

static void got_ip_handler(void *arg, esp_event_base_t base,
                           int32_t event_id, void *event_data)
{
    (void)arg;
    (void)base;
    (void)event_id;
    const ip_event_got_ip_t *event = event_data;
    ESP_LOGI(TAG, "Dashboard san sang: http://" IPSTR,
             IP2STR(&event->ip_info.ip));
}

void web_dashboard_init(void)
{
    data_mutex = xSemaphoreCreateMutex();
    ESP_ERROR_CHECK(data_mutex == NULL ? ESP_ERR_NO_MEM : ESP_OK);

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.uri_match_fn = httpd_uri_match_wildcard;
    config.stack_size = 6144;
    config.max_uri_handlers = 4;
    config.lru_purge_enable = true;
    httpd_handle_t server = NULL;
    ESP_ERROR_CHECK(httpd_start(&server, &config));
    const httpd_uri_t latest_uri = {
        .uri = "/api/latest", .method = HTTP_GET, .handler = latest_handler,
    };
    const httpd_uri_t history_uri = {
        .uri = "/api/history", .method = HTTP_GET, .handler = history_handler,
    };
    const httpd_uri_t dashboard_uri = {
        .uri = "/*", .method = HTTP_GET, .handler = dashboard_handler,
    };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &latest_uri));
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &history_uri));
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &dashboard_uri));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                                got_ip_handler, NULL));
    ESP_LOGI(TAG, "May chu giao dien da khoi dong");
}

void web_dashboard_update(uint16_t tds, uint16_t tds_mirror,
                          uint8_t ppc, uint8_t ro, uint8_t cto)
{
    if (!data_mutex || xSemaphoreTake(data_mutex, 0) != pdTRUE) return;
    const int64_t now_ms = esp_timer_get_time() / 1000;
    latest = (latest_sample_t){
        .ready = true, .seq = latest.seq + 1, .updated_ms = now_ms,
        .tds = tds, .mirror = tds_mirror, .ppc = ppc, .ro = ro, .cto = cto,
    };
    if (history_count == 0 || now_ms - history_last_ms >= HISTORY_INTERVAL_MS) {
        history[history_head] = (history_sample_t){
            .seq = latest.seq, .ms = now_ms, .tds = tds,
            .ppc = ppc, .ro = ro, .cto = cto,
        };
        history_head = (history_head + 1) % HISTORY_SIZE;
        if (history_count < HISTORY_SIZE) ++history_count;
        history_last_ms = now_ms;
    }
    xSemaphoreGive(data_mutex);
}
