package com.novelai.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.novelai.backend.model.ConnectionTestRequest;
import com.novelai.backend.model.GenericResponse;
import com.novelai.backend.model.SettingsData;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AiConnectionService {

    private final SettingsService settingsService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AiConnectionService(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    public GenericResponse testConnection(ConnectionTestRequest request) {
        SettingsData settings = settingsService.readSettings();
        SettingsData.AiSettings ai = settings.getAi();

        String apiUrl = firstNonBlank(request.getApiUrl(), ai == null ? null : ai.getApiUrl());
        String apiKey = firstNonBlank(request.getApiKey(), ai == null ? null : ai.getApiKey());
        String model = firstNonBlank(request.getModel(), ai == null ? null : ai.getModel(), "minimaxai/minimax-m2.5");
        String proxyUrl = firstNonBlank(request.getProxyUrl(), ai == null ? null : ai.getProxyUrl());

        if (apiUrl == null || apiKey == null) {
            return GenericResponse.failure("请先配置 API 地址和 API Key");
        }

        try {
            HttpClient.Builder builder = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30));

            if (proxyUrl != null && !proxyUrl.isBlank()) {
                URI proxyUri = URI.create(proxyUrl);
                builder.proxy(ProxySelector.of(new InetSocketAddress(proxyUri.getHost(), proxyUri.getPort())));
            }

            HttpClient client = builder.build();

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", model);
            payload.put("messages", List.of(Map.of("role", "user", "content", "你好，请只回复“连接成功”。")));
            payload.put("max_tokens", 100);

            HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(apiUrl))
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .header("Authorization", "Bearer " + apiKey)
                .timeout(Duration.ofSeconds(30))
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                .build();

            HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return GenericResponse.failure("连接失败: HTTP " + response.statusCode() + " " + response.body());
            }

            JsonNode jsonNode = objectMapper.readTree(response.body());
            JsonNode contentNode = jsonNode.path("choices").path(0).path("message").path("content");
            return GenericResponse.success(contentNode.asText("连接成功"));
        } catch (Exception error) {
            return GenericResponse.failure(error.getMessage());
        }
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }

        return null;
    }
}
