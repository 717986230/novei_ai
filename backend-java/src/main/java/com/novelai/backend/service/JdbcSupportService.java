package com.novelai.backend.service;

import com.novelai.backend.model.SettingsData;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class JdbcSupportService {

    private final SettingsService settingsService;
    private final Map<String, JdbcTemplate> jdbcCache = new ConcurrentHashMap<>();

    public JdbcSupportService(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    public JdbcTemplate getJdbcTemplate() {
        SettingsData settings = settingsService.readSettings();
        SettingsData.MysqlSettings mysql = settings.getMysql();
        if (mysql == null || !Boolean.TRUE.equals(mysql.getEnabled())) {
            return null;
        }

        String key = String.join(":",
            value(mysql.getHost()),
            String.valueOf(mysql.getPort()),
            value(mysql.getDatabase()),
            value(mysql.getUser())
        );

        return jdbcCache.computeIfAbsent(key, ignored -> {
            ensureDatabase(mysql);
            DataSource dataSource = new DriverManagerDataSource(buildJdbcUrl(mysql), mysql.getUser(), mysql.getPassword());
            JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
            ensureTables(jdbcTemplate);
            return jdbcTemplate;
        });
    }

    private void ensureDatabase(SettingsData.MysqlSettings mysql) {
        if (!Boolean.TRUE.equals(mysql.getAutoCreateDatabase())) {
            return;
        }

        String jdbcUrl = String.format(
            "jdbc:mysql://%s:%d/?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai",
            mysql.getHost(),
            mysql.getPort()
        );

        try (
            Connection connection = java.sql.DriverManager.getConnection(jdbcUrl, mysql.getUser(), mysql.getPassword());
            Statement statement = connection.createStatement()
        ) {
            statement.execute(
                "CREATE DATABASE IF NOT EXISTS `" + mysql.getDatabase() + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            );
        } catch (Exception error) {
            throw new IllegalStateException("初始化 MySQL 数据库失败: " + error.getMessage(), error);
        }
    }

    private void ensureTables(JdbcTemplate jdbcTemplate) {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS novels (
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              output_dir VARCHAR(255) NOT NULL UNIQUE,
              title VARCHAR(255) NOT NULL,
              type VARCHAR(120) DEFAULT '',
              description TEXT,
              target_chapters INT DEFAULT 0,
              words_per_chapter INT DEFAULT 0,
              outline_json LONGTEXT NULL,
              created_at DATETIME NOT NULL,
              updated_at DATETIME NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """);

        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS chapters (
              id BIGINT PRIMARY KEY AUTO_INCREMENT,
              output_dir VARCHAR(255) NOT NULL,
              chapter_number INT NOT NULL,
              title VARCHAR(255) NOT NULL,
              content LONGTEXT,
              outline TEXT,
              word_count INT DEFAULT 0,
              created_at DATETIME NOT NULL,
              published TINYINT(1) NOT NULL DEFAULT 0,
              published_at DATETIME NULL,
              platforms_json TEXT NULL,
              updated_at DATETIME NOT NULL,
              UNIQUE KEY uniq_output_chapter (output_dir, chapter_number),
              KEY idx_output_published (output_dir, published),
              KEY idx_output_number (output_dir, chapter_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """);

        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS workflows (
              id VARCHAR(64) PRIMARY KEY,
              book_key VARCHAR(255) NOT NULL DEFAULT '',
              type VARCHAR(80) NOT NULL,
              title VARCHAR(255) NOT NULL,
              status VARCHAR(30) NOT NULL,
              payload_json LONGTEXT NULL,
              progress_json LONGTEXT NULL,
              result_json LONGTEXT NULL,
              error_text TEXT NULL,
              created_at DATETIME NOT NULL,
              started_at DATETIME NULL,
              finished_at DATETIME NULL,
              updated_at DATETIME NOT NULL,
              KEY idx_workflows_book_created (book_key, created_at),
              KEY idx_workflows_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """);
    }

    private String buildJdbcUrl(SettingsData.MysqlSettings mysql) {
        return String.format(
            "jdbc:mysql://%s:%d/%s?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai",
            mysql.getHost(),
            mysql.getPort(),
            mysql.getDatabase()
        );
    }

    private String value(String input) {
        return input == null ? "" : input;
    }
}
