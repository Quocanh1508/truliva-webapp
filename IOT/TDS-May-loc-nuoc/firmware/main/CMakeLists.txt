idf_component_register(SRCS "tds_sniffer.c" "protocol_parser.c" "protocol_proxy.c"
                            "filter_decode.c"
                            "notification.c"
                            "notification_format.c"
                            "web_dashboard.c"
                       INCLUDE_DIRS "."
                       PRIV_REQUIRES console esp_driver_gpio esp_driver_uart esp_event
                                     esp_http_client esp_http_server esp_netif esp_timer esp_wifi
                                     mbedtls nvs_flash
                       EMBED_FILES "web/dashboard.html")
