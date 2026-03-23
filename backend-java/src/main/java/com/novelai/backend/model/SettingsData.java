package com.novelai.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.LinkedHashMap;
import java.util.Map;

public class SettingsData {

    private AiSettings ai = new AiSettings();
    private NovelSettings novel = new NovelSettings();
    private MysqlSettings mysql = new MysqlSettings();
    private Map<String, Object> schedule = new LinkedHashMap<>();
    private Map<String, PlatformSettings> platforms = new LinkedHashMap<>();

    public AiSettings getAi() {
        return ai;
    }

    public void setAi(AiSettings ai) {
        this.ai = ai;
    }

    public NovelSettings getNovel() {
        return novel;
    }

    public void setNovel(NovelSettings novel) {
        this.novel = novel;
    }

    public MysqlSettings getMysql() {
        return mysql;
    }

    public void setMysql(MysqlSettings mysql) {
        this.mysql = mysql;
    }

    public Map<String, Object> getSchedule() {
        return schedule;
    }

    public void setSchedule(Map<String, Object> schedule) {
        this.schedule = schedule;
    }

    public Map<String, PlatformSettings> getPlatforms() {
        return platforms;
    }

    public void setPlatforms(Map<String, PlatformSettings> platforms) {
        this.platforms = platforms == null ? new LinkedHashMap<>() : platforms;
    }

    public static class AiSettings {
        private String provider;
        private String baseUrl;
        private String apiUrl;
        private String apiKey;
        private String model;
        private String proxyUrl;
        private Integer timeoutMs;
        private Integer retryCount;
        private Boolean hasApiKey;

        public String getProvider() {
            return provider;
        }

        public void setProvider(String provider) {
            this.provider = provider;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

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

        public Boolean getHasApiKey() {
            return hasApiKey;
        }

        public void setHasApiKey(Boolean hasApiKey) {
            this.hasApiKey = hasApiKey;
        }
    }

    public static class NovelSettings {
        private Integer defaultChapterCount;
        private Integer wordsPerChapter;
        private String outputDir;
        private String libraryDir;
        private String currentBookKey;

        public Integer getDefaultChapterCount() {
            return defaultChapterCount;
        }

        public void setDefaultChapterCount(Integer defaultChapterCount) {
            this.defaultChapterCount = defaultChapterCount;
        }

        public Integer getWordsPerChapter() {
            return wordsPerChapter;
        }

        public void setWordsPerChapter(Integer wordsPerChapter) {
            this.wordsPerChapter = wordsPerChapter;
        }

        public String getOutputDir() {
            return outputDir;
        }

        public void setOutputDir(String outputDir) {
            this.outputDir = outputDir;
        }

        public String getLibraryDir() {
            return libraryDir;
        }

        public void setLibraryDir(String libraryDir) {
            this.libraryDir = libraryDir;
        }

        public String getCurrentBookKey() {
            return currentBookKey;
        }

        public void setCurrentBookKey(String currentBookKey) {
            this.currentBookKey = currentBookKey;
        }
    }

    public static class MysqlSettings {
        private Boolean enabled;
        private String host;
        private Integer port;
        private String user;
        private String password;
        private String database;
        private Integer connectionLimit;
        private Boolean autoCreateDatabase;
        private Boolean hasPassword;

        public Boolean getEnabled() {
            return enabled;
        }

        public void setEnabled(Boolean enabled) {
            this.enabled = enabled;
        }

        public String getHost() {
            return host;
        }

        public void setHost(String host) {
            this.host = host;
        }

        public Integer getPort() {
            return port;
        }

        public void setPort(Integer port) {
            this.port = port;
        }

        public String getUser() {
            return user;
        }

        public void setUser(String user) {
            this.user = user;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public String getDatabase() {
            return database;
        }

        public void setDatabase(String database) {
            this.database = database;
        }

        public Integer getConnectionLimit() {
            return connectionLimit;
        }

        public void setConnectionLimit(Integer connectionLimit) {
            this.connectionLimit = connectionLimit;
        }

        public Boolean getAutoCreateDatabase() {
            return autoCreateDatabase;
        }

        public void setAutoCreateDatabase(Boolean autoCreateDatabase) {
            this.autoCreateDatabase = autoCreateDatabase;
        }

        public Boolean getHasPassword() {
            return hasPassword;
        }

        public void setHasPassword(Boolean hasPassword) {
            this.hasPassword = hasPassword;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PlatformSettings {
        private Boolean enabled;
        private String label;
        private String loginMode;
        private String username;
        private String password;
        private String cookies;
        private String notes;
        private Boolean hasPassword;
        private Boolean hasCookies;

        public Boolean getEnabled() {
            return enabled;
        }

        public void setEnabled(Boolean enabled) {
            this.enabled = enabled;
        }

        public String getLabel() {
            return label;
        }

        public void setLabel(String label) {
            this.label = label;
        }

        public String getLoginMode() {
            return loginMode;
        }

        public void setLoginMode(String loginMode) {
            this.loginMode = loginMode;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public String getCookies() {
            return cookies;
        }

        public void setCookies(String cookies) {
            this.cookies = cookies;
        }

        public String getNotes() {
            return notes;
        }

        public void setNotes(String notes) {
            this.notes = notes;
        }

        public Boolean getHasPassword() {
            return hasPassword;
        }

        public void setHasPassword(Boolean hasPassword) {
            this.hasPassword = hasPassword;
        }

        public Boolean getHasCookies() {
            return hasCookies;
        }

        public void setHasCookies(Boolean hasCookies) {
            this.hasCookies = hasCookies;
        }
    }
}
