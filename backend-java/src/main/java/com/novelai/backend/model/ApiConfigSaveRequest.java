package com.novelai.backend.model;

import jakarta.validation.constraints.NotBlank;

import java.util.LinkedHashMap;
import java.util.Map;

public class ApiConfigSaveRequest {

    @NotBlank
    private String apiUrl;
    private String apiKey;
    private String model;
    private String provider;
    private String proxyUrl;
    private Integer timeoutMs;
    private Integer retryCount;
    private Map<String, SettingsData.PlatformSettings> platforms = new LinkedHashMap<>();

    public String getApiUrl() {
        return apiUrl;
    }

    public void setApiUrl(String apiUrl) {
        this.apiUrl = apiUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getProxyUrl() {
        return proxyUrl;
    }

    public void setProxyUrl(String proxyUrl) {
        this.proxyUrl = proxyUrl;
    }

    public Integer getTimeoutMs() {
        return timeoutMs;
    }

    public void setTimeoutMs(Integer timeoutMs) {
        this.timeoutMs = timeoutMs;
    }

    public Integer getRetryCount() {
        return retryCount;
    }

    public void setRetryCount(Integer retryCount) {
        this.retryCount = retryCount;
    }

    public Map<String, SettingsData.PlatformSettings> getPlatforms() {
        return platforms;
    }

    public void setPlatforms(Map<String, SettingsData.PlatformSettings> platforms) {
        this.platforms = platforms == null ? new LinkedHashMap<>() : platforms;
    }
}
