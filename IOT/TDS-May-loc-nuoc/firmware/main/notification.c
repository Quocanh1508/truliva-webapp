#include "notification.h"

#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#include "esp_crt_bundle.h"
#include "esp_event.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "notification_format.h"
#include "sdkconfig.h"

#ifdef CONFIG_TDS_NETWORK_ENABLED

#define WIFI_CONNECTED_BIT BIT0

typedef struct {
    bool valid;
    uint16_t tds;
    uint8_t ppc;
    uint8_t ro;
    uint8_t cto;
} water_snapshot_t;

static const char *TAG = "TELEGRAM";
static EventGroupHandle_t wifi_events;
static SemaphoreHandle_t snapshot_mutex;
static water_snapshot_t latest_snapshot;

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_data;
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT &&
               event_id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(wifi_events, WIFI_CONNECTED_BIT);
        ESP_LOGW(TAG, "Wi-Fi disconnected; reconnecting");
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        xEventGroupSetBits(wifi_events, WIFI_CONNECTED_BIT);
        ESP_LOGI(TAG, "Wi-Fi connected");
    }
}

static void wifi_init(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_events = xEventGroupCreate();
    ESP_ERROR_CHECK(wifi_events == NULL ? ESP_ERR_NO_MEM : ESP_OK);

    const wifi_init_config_t init_config = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init_config));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                                wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                                wifi_event_handler, NULL));

    wifi_config_t config = {0};
    strlcpy((char *)config.sta.ssid, CONFIG_TDS_WIFI_SSID,
            sizeof(config.sta.ssid));
    strlcpy((char *)config.sta.password, CONFIG_TDS_WIFI_PASSWORD,
            sizeof(config.sta.password));
    config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
    config.sta.pmf_cfg.capable = true;
    config.sta.pmf_cfg.required = false;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &config));
    ESP_ERROR_CHECK(esp_wifi_start());
}

static bool read_snapshot(water_snapshot_t *snapshot)
{
    if (xSemaphoreTake(snapshot_mutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        return false;
    }
    *snapshot = latest_snapshot;
    xSemaphoreGive(snapshot_mutex);
    return snapshot->valid;
}

static bool telegram_send(const water_snapshot_t *snapshot)
{
    char url[192];
    const int url_length = snprintf(
        url, sizeof(url), "https://api.telegram.org/bot%s/sendMessage",
        CONFIG_TDS_TELEGRAM_BOT_TOKEN);
    if (url_length < 0 || url_length >= (int)sizeof(url)) {
        ESP_LOGE(TAG, "Telegram URL configuration is invalid");
        return false;
    }

    char body[1200];
    if (!notification_format_json(
            body, sizeof(body), CONFIG_TDS_TELEGRAM_CHAT_ID,
            CONFIG_TDS_NOTIFY_INTERVAL_SECONDS, snapshot->tds,
            snapshot->ppc, snapshot->ro, snapshot->cto)) {
        ESP_LOGE(TAG, "Telegram message is too long");
        return false;
    }
    const int body_length = strlen(body);

    const esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 10000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .keep_alive_enable = true,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == NULL) {
        ESP_LOGE(TAG, "Cannot initialize HTTPS client");
        return false;
    }

    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, body, body_length);
    const esp_err_t result = esp_http_client_perform(client);
    const int status = result == ESP_OK
                           ? esp_http_client_get_status_code(client)
                           : 0;
    esp_http_client_cleanup(client);

    if (result != ESP_OK || status != 200) {
        ESP_LOGW(TAG, "Telegram send failed: transport=%s, HTTP=%d",
                 esp_err_to_name(result), status);
        return false;
    }
    ESP_LOGI(TAG, "Telegram notification sent (HTTP 200)");
    return true;
}

static void notification_task(void *arg)
{
    (void)arg;
    const TickType_t interval =
        pdMS_TO_TICKS(CONFIG_TDS_NOTIFY_INTERVAL_SECONDS * 1000);
    TickType_t last_wake = xTaskGetTickCount();

    while (true) {
        vTaskDelayUntil(&last_wake, interval);
        const EventBits_t bits = xEventGroupGetBits(wifi_events);
        if ((bits & WIFI_CONNECTED_BIT) == 0) {
            ESP_LOGW(TAG, "Notification skipped: Wi-Fi is not connected");
            continue;
        }

        water_snapshot_t snapshot;
        if (!read_snapshot(&snapshot)) {
            ESP_LOGW(TAG, "Notification skipped: no valid TDS frame yet");
            continue;
        }
        telegram_send(&snapshot);
    }
}

void notification_init(void)
{
    snapshot_mutex = xSemaphoreCreateMutex();
    ESP_ERROR_CHECK(snapshot_mutex == NULL ? ESP_ERR_NO_MEM : ESP_OK);

    esp_err_t result = nvs_flash_init();
    if (result == ESP_ERR_NVS_NO_FREE_PAGES ||
        result == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        result = nvs_flash_init();
    }
    ESP_ERROR_CHECK(result);

    esp_log_level_set("HTTP_CLIENT", ESP_LOG_WARN);
    wifi_init();
    const BaseType_t task_created =
        xTaskCreate(notification_task, "telegram_notify", 12288,
                    NULL, 5, NULL);
    ESP_ERROR_CHECK(task_created == pdPASS ? ESP_OK : ESP_ERR_NO_MEM);
    ESP_LOGI(TAG, "Telegram notifications enabled every %d seconds",
             CONFIG_TDS_NOTIFY_INTERVAL_SECONDS);
}

void notification_update(uint16_t tds, uint8_t ppc,
                         uint8_t ro, uint8_t cto)
{
    if (snapshot_mutex == NULL ||
        xSemaphoreTake(snapshot_mutex, 0) != pdTRUE) {
        return;
    }
    latest_snapshot = (water_snapshot_t){
        .valid = true,
        .tds = tds,
        .ppc = ppc,
        .ro = ro,
        .cto = cto,
    };
    xSemaphoreGive(snapshot_mutex);
}

#else

void notification_init(void)
{
}

void notification_update(uint16_t tds, uint8_t ppc,
                         uint8_t ro, uint8_t cto)
{
    (void)tds;
    (void)ppc;
    (void)ro;
    (void)cto;
}

#endif
