package com.novelai.backend.service;

import com.novelai.backend.model.HealthResponse;
import com.novelai.backend.model.SettingsData;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.time.OffsetDateTime;

@Service
public class HealthService {

    private final SettingsService settingsService;

    public HealthService(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    public HealthResponse buildHealth() {
        SettingsData settings = settingsService.readSettings();
        SettingsData.AiSettings ai = settings.getAi();
        SettingsData.MysqlSettings mysql = settings.getMysql();

        HealthResponse response = new HealthResponse();
        response.setSuccess(true);
        response.setServerTime(OffsetDateTime.now().toString());
        response.setAiConfigured(ai != null
            && ai.getApiUrl() != null && !ai.getApiUrl().isBlank()
            && ai.getApiKey() != null && !ai.getApiKey().isBlank());
        response.setMysqlEnabled(mysql != null && Boolean.TRUE.equals(mysql.getEnabled()));
        response.setMysqlAvailable(checkMysql(mysql));
        return response;
    }

    private boolean checkMysql(SettingsData.MysqlSettings mysql) {
        if (mysql == null || !Boolean.TRUE.equals(mysql.getEnabled())) {
            return false;
        }

        String jdbcUrl = String.format(
            "jdbc:mysql://%s:%d/%s?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai",
            mysql.getHost(),
            mysql.getPort(),
            mysql.getDatabase()
        );

        try (Connection ignored = DriverManager.getConnection(jdbcUrl, mysql.getUser(), mysql.getPassword())) {
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
