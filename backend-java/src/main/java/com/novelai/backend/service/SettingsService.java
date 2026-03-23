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
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;

@Service
public class SettingsService {

    private static final String MASK = "********";
    private static final String DEFAULT_LOGIN_MODE = "cookies";

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
            boolean hasApiKey = hasSecret(data.getAi().getApiKey());
            data.getAi().setHasApiKey(hasApiKey);
            data.getAi().setApiKey(hasApiKey ? MASK : "");
        }

        if (data.getMysql() != null) {
            boolean hasPassword = hasSecret(data.getMysql().getPassword());
            data.getMysql().setHasPassword(hasPassword);
            data.getMysql().setPassword(hasPassword ? MASK : "");
        }

        data.setPlatforms(maskPlatforms(data.getPlatforms()));
        return data;
    }

    public void saveApiConfig(ApiConfigSaveRequest request) {
        SettingsData data = readSettings();
        SettingsData.AiSettings ai = data.getAi() == null ? new SettingsData.AiSettings() : data.getAi();

        ai.setProvider(firstNonBlank(request.getProvider(), "custom"));
        ai.setApiUrl(trimToEmpty(request.getApiUrl()));
        ai.setBaseUrl(stripChatCompletions(request.getApiUrl()));
        ai.setModel(firstNonBlank(request.getModel(), "minimaxai/minimax-m2.5"));
        ai.setProxyUrl(trimToEmpty(request.getProxyUrl()));

        if (request.getApiKey() != null && !request.getApiKey().isBlank()) {
            String apiKey = resolveSecret(request.getApiKey(), ai.getApiKey());
            if (!apiKey.isBlank()) {
                ai.setApiKey(apiKey);
            }
        }

        ai.setTimeoutMs(request.getTimeoutMs() != null && request.getTimeoutMs() > 0 ? request.getTimeoutMs() : 120000);
        ai.setRetryCount(request.getRetryCount() != null && request.getRetryCount() >= 0 ? request.getRetryCount() : 1);

        data.setAi(ai);
        data.setPlatforms(mergePlatforms(data.getPlatforms(), request.getPlatforms()));
        writeSettings(data);
    }

    public void saveSettings(SettingsData data) {
        writeSettings(data);
    }

    public void updateSettings(Consumer<SettingsData> updater) {
        SettingsData data = readSettings();
        updater.accept(data);
        writeSettings(data);
    }

    public void saveCurrentBookKey(String bookKey) {
        updateSettings(data -> {
            SettingsData.NovelSettings novel = data.getNovel() == null ? new SettingsData.NovelSettings() : data.getNovel();
            novel.setCurrentBookKey(bookKey);
            data.setNovel(novel);
        });
    }

    public Path resolveSettingsPath() {
        return Paths.get(appPathsProperties.getSettingsFile()).normalize().toAbsolutePath();
    }

    public Path resolveProjectRoot() {
        Path settingsPath = resolveSettingsPath();
        Path settingsDir = settingsPath.getParent();
        if (settingsDir == null) {
            return settingsPath.getParent();
        }

        Path candidate = settingsDir.getParent();
        return candidate == null ? settingsDir : candidate;
    }

    public Path resolveWorkspacePath(String configuredPath) {
        if (configuredPath == null || configuredPath.isBlank()) {
            return resolveProjectRoot();
        }

        Path path = Paths.get(configuredPath);
        if (path.isAbsolute()) {
            return path.normalize();
        }

        return resolveProjectRoot().resolve(path).normalize();
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

    private Map<String, SettingsData.PlatformSettings> maskPlatforms(Map<String, SettingsData.PlatformSettings> platforms) {
        Map<String, SettingsData.PlatformSettings> normalized = ensureDefaultPlatforms(platforms);
        Map<String, SettingsData.PlatformSettings> masked = new LinkedHashMap<>();

        normalized.forEach((key, value) -> {
            SettingsData.PlatformSettings source = value == null ? new SettingsData.PlatformSettings() : value;
            SettingsData.PlatformSettings copy = new SettingsData.PlatformSettings();
            boolean hasPassword = hasSecret(source.getPassword());
            boolean hasCookies = hasSecret(source.getCookies());

            copy.setEnabled(Boolean.TRUE.equals(source.getEnabled()));
            copy.setLabel(firstNonBlank(source.getLabel(), defaultPlatformLabel(key)));
            copy.setLoginMode(normalizeLoginMode(source));
            copy.setUsername(trimToEmpty(source.getUsername()));
            copy.setPassword(hasPassword ? MASK : "");
            copy.setCookies(hasCookies ? MASK : "");
            copy.setNotes(trimToEmpty(source.getNotes()));
            copy.setHasPassword(hasPassword);
            copy.setHasCookies(hasCookies);
            masked.put(key, copy);
        });

        return masked;
    }

    private Map<String, SettingsData.PlatformSettings> mergePlatforms(
        Map<String, SettingsData.PlatformSettings> existingPlatforms,
        Map<String, SettingsData.PlatformSettings> requestedPlatforms
    ) {
        Map<String, SettingsData.PlatformSettings> merged = ensureDefaultPlatforms(existingPlatforms);
        if (requestedPlatforms == null || requestedPlatforms.isEmpty()) {
            return merged;
        }

        requestedPlatforms.forEach((key, incoming) -> {
            SettingsData.PlatformSettings current = merged.getOrDefault(key, defaultPlatform(key));
            SettingsData.PlatformSettings source = incoming == null ? new SettingsData.PlatformSettings() : incoming;
            SettingsData.PlatformSettings next = new SettingsData.PlatformSettings();

            next.setEnabled(Boolean.TRUE.equals(source.getEnabled()));
            next.setLabel(firstNonBlank(source.getLabel(), current.getLabel(), defaultPlatformLabel(key)));
            next.setLoginMode(normalizeLoginMode(source, current));
            next.setUsername(trimToEmpty(source.getUsername()));
            next.setNotes(trimToEmpty(source.getNotes()));
            next.setPassword(resolveSecret(source.getPassword(), current.getPassword()));
            next.setCookies(resolveSecret(source.getCookies(), current.getCookies()));
            next.setHasPassword(hasSecret(next.getPassword()));
            next.setHasCookies(hasSecret(next.getCookies()));
            merged.put(key, next);
        });

        return merged;
    }

    private Map<String, SettingsData.PlatformSettings> ensureDefaultPlatforms(Map<String, SettingsData.PlatformSettings> source) {
        Map<String, SettingsData.PlatformSettings> normalized = new LinkedHashMap<>();
        defaultPlatforms().forEach((key, fallback) -> normalized.put(key, normalizePlatform(source == null ? null : source.get(key), key, fallback)));

        if (source != null) {
            source.forEach((key, value) -> {
                if (!normalized.containsKey(key)) {
                    normalized.put(key, normalizePlatform(value, key, defaultPlatform(key)));
                }
            });
        }

        return normalized;
    }

    private SettingsData.PlatformSettings normalizePlatform(
        SettingsData.PlatformSettings candidate,
        String key,
        SettingsData.PlatformSettings fallback
    ) {
        SettingsData.PlatformSettings actual = candidate == null ? fallback : candidate;
        SettingsData.PlatformSettings copy = new SettingsData.PlatformSettings();

        copy.setEnabled(Boolean.TRUE.equals(actual.getEnabled()));
        copy.setLabel(firstNonBlank(actual.getLabel(), defaultPlatformLabel(key)));
        copy.setLoginMode(normalizeLoginMode(actual));
        copy.setUsername(trimToEmpty(actual.getUsername()));
        copy.setPassword(trimToEmpty(actual.getPassword()));
        copy.setCookies(trimToEmpty(actual.getCookies()));
        copy.setNotes(trimToEmpty(actual.getNotes()));
        copy.setHasPassword(hasSecret(copy.getPassword()));
        copy.setHasCookies(hasSecret(copy.getCookies()));
        return copy;
    }

    private Map<String, SettingsData.PlatformSettings> defaultPlatforms() {
        Map<String, SettingsData.PlatformSettings> defaults = new LinkedHashMap<>();
        defaults.put("fanqie", defaultPlatform("fanqie"));
        defaults.put("qidian", defaultPlatform("qidian"));
        defaults.put("qimao", defaultPlatform("qimao"));
        defaults.put("douyin", defaultPlatform("douyin"));
        defaults.put("zongheng", defaultPlatform("zongheng"));
        defaults.put("17k", defaultPlatform("17k"));
        defaults.put("custom", defaultPlatform("custom"));
        return defaults;
    }

    private SettingsData.PlatformSettings defaultPlatform(String key) {
        SettingsData.PlatformSettings settings = new SettingsData.PlatformSettings();
        settings.setEnabled(false);
        settings.setLabel(defaultPlatformLabel(key));
        settings.setLoginMode(DEFAULT_LOGIN_MODE);
        settings.setUsername("");
        settings.setPassword("");
        settings.setCookies("");
        settings.setNotes("");
        settings.setHasPassword(false);
        settings.setHasCookies(false);
        return settings;
    }

    private String defaultPlatformLabel(String key) {
        return switch (key) {
            case "fanqie" -> "番茄小说";
            case "qidian" -> "起点中文网";
            case "qimao" -> "七猫小说";
            case "douyin" -> "抖音小说";
            case "zongheng" -> "纵横中文网";
            case "17k" -> "17K 小说网";
            case "custom" -> "其他平台";
            default -> key;
        };
    }

    private String stripChatCompletions(String apiUrl) {
        if (apiUrl == null) {
            return "";
        }

        return apiUrl.replaceAll("/chat/completions/?$", "");
    }

    private String resolveSecret(String incoming, String existing) {
        String normalizedIncoming = sanitizeSecret(incoming);
        if (!normalizedIncoming.isBlank()) {
            return normalizedIncoming;
        }
        return sanitizeSecret(existing);
    }

    private String sanitizeSecret(String value) {
        String normalized = trimToEmpty(value);
        if (normalized.isBlank() || MASK.equals(normalized)) {
            return "";
        }
        return normalized;
    }

    private boolean hasSecret(String value) {
        return !sanitizeSecret(value).isBlank();
    }

    private String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }

        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }

        return "";
    }

    private String normalizeLoginMode(SettingsData.PlatformSettings... candidates) {
        if (candidates != null) {
            for (SettingsData.PlatformSettings candidate : candidates) {
                if (candidate == null) {
                    continue;
                }

                String mode = trimToEmpty(candidate.getLoginMode()).toLowerCase();
                if (mode.isBlank()) {
                    continue;
                }
                if ("cookie".equals(mode)) {
                    return "cookies";
                }
                if ("cookies".equals(mode) || "oauth".equals(mode) || "account".equals(mode)) {
                    return mode;
                }
            }
        }

        return DEFAULT_LOGIN_MODE;
    }
}
