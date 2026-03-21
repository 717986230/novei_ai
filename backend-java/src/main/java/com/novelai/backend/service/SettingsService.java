package com.novelai.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.novelai.backend.config.AppPathsProperties;
import com.novelai.backend.model.ApiConfigSaveRequest;
import com.novelai.backend.model.SettingsData;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Service
public class SettingsService {

    private final AppPathsProperties appPathsProperties;
    private final ObjectMapper objectMapper;

    public SettingsService(AppPathsProperties appPathsProperties) {
        this.appPathsProperties = appPathsProperties;
        this.objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    }

    public SettingsData readSettings() {
        Path settingsPath = resolveSettingsPath();
        if (!Files.exists(settingsPath)) {
            return new SettingsData();
        }

        try {
            return objectMapper.readValue(settingsPath.toFile(), SettingsData.class);
        } catch (IOException error) {
            throw new IllegalStateException("读取 settings.json 失败: " + error.getMessage(), error);
        }
    }

    public SettingsData readMaskedSettings() {
        SettingsData data = readSettings();
        if (data.getAi() != null) {
          boolean hasApiKey = data.getAi().getApiKey() != null && !data.getAi().getApiKey().isBlank();
          data.getAi().setHasApiKey(hasApiKey);
          data.getAi().setApiKey(hasApiKey ? "********" : "");
        }

        if (data.getMysql() != null) {
          boolean hasPassword = data.getMysql().getPassword() != null && !data.getMysql().getPassword().isBlank();
          data.getMysql().setHasPassword(hasPassword);
          data.getMysql().setPassword(hasPassword ? "********" : "");
        }

        return data;
    }

    public void saveApiConfig(ApiConfigSaveRequest request) {
        SettingsData data = readSettings();
        SettingsData.AiSettings ai = data.getAi() == null ? new SettingsData.AiSettings() : data.getAi();

        ai.setProvider("custom");
        ai.setApiUrl(request.getApiUrl());
        ai.setBaseUrl(stripChatCompletions(request.getApiUrl()));
        ai.setModel(request.getModel() == null || request.getModel().isBlank()
            ? "minimaxai/minimax-m2.5"
            : request.getModel().trim());
        ai.setProxyUrl(request.getProxyUrl() == null ? "" : request.getProxyUrl().trim());

        if (request.getApiKey() != null && !request.getApiKey().isBlank()) {
            ai.setApiKey(request.getApiKey().trim());
        }

        if (ai.getTimeoutMs() == null) {
            ai.setTimeoutMs(120000);
        }
        if (ai.getRetryCount() == null) {
            ai.setRetryCount(1);
        }

        data.setAi(ai);
        writeSettings(data);
    }

    public Path resolveSettingsPath() {
        return Paths.get(appPathsProperties.getSettingsFile()).normalize().toAbsolutePath();
    }

    private void writeSettings(SettingsData data) {
        Path settingsPath = resolveSettingsPath();
        try {
            Files.createDirectories(settingsPath.getParent());
            objectMapper.writeValue(settingsPath.toFile(), data);
        } catch (IOException error) {
            throw new IllegalStateException("写入 settings.json 失败: " + error.getMessage(), error);
        }
    }

    private String stripChatCompletions(String apiUrl) {
        if (apiUrl == null) {
            return "";
        }

        return apiUrl.replaceAll("/chat/completions/?$", "");
    }
}
