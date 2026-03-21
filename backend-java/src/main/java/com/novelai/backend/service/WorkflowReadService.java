package com.novelai.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.novelai.backend.model.SettingsData;
import com.novelai.backend.model.WorkflowDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Service
public class WorkflowReadService {

    private final SettingsService settingsService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public WorkflowReadService(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    public List<WorkflowDto> list(String bookKey) {
        JdbcTemplate jdbcTemplate = createJdbcTemplate();
        if (jdbcTemplate == null) {
            return Collections.emptyList();
        }

        if (bookKey != null && !bookKey.isBlank()) {
            return jdbcTemplate.query(
                "SELECT * FROM workflows WHERE book_key = ? ORDER BY created_at DESC LIMIT 100",
                (rs, rowNum) -> mapWorkflow(rs),
                bookKey
            );
        }

        return jdbcTemplate.query(
            "SELECT * FROM workflows ORDER BY created_at DESC LIMIT 100",
            (rs, rowNum) -> mapWorkflow(rs)
        );
    }

    public WorkflowDto get(String id) {
        JdbcTemplate jdbcTemplate = createJdbcTemplate();
        if (jdbcTemplate == null) {
            return null;
        }

        List<WorkflowDto> results = jdbcTemplate.query(
            "SELECT * FROM workflows WHERE id = ? LIMIT 1",
            (rs, rowNum) -> mapWorkflow(rs),
            id
        );

        return results.isEmpty() ? null : results.get(0);
    }

    private JdbcTemplate createJdbcTemplate() {
        SettingsData settings = settingsService.readSettings();
        SettingsData.MysqlSettings mysql = settings.getMysql();
        if (mysql == null || !Boolean.TRUE.equals(mysql.getEnabled())) {
            return null;
        }

        String jdbcUrl = String.format(
            "jdbc:mysql://%s:%d/%s?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai",
            mysql.getHost(),
            mysql.getPort(),
            mysql.getDatabase()
        );

        DataSource dataSource = new DriverManagerDataSource(jdbcUrl, mysql.getUser(), mysql.getPassword());
        return new JdbcTemplate(dataSource);
    }

    private WorkflowDto mapWorkflow(ResultSet rs) throws java.sql.SQLException {
        WorkflowDto dto = new WorkflowDto();
        dto.setId(rs.getString("id"));
        dto.setBookKey(rs.getString("book_key"));
        dto.setType(rs.getString("type"));
        dto.setTitle(rs.getString("title"));
        dto.setStatus(rs.getString("status"));
        dto.setPayload(readJsonMap(rs.getString("payload_json")));
        dto.setProgress(readJsonMap(rs.getString("progress_json")));
        dto.setResult(readJsonMap(rs.getString("result_json")));
        dto.setError(rs.getString("error_text"));
        dto.setCreatedAt(toOffsetDateTime(rs.getTimestamp("created_at")));
        dto.setStartedAt(toOffsetDateTime(rs.getTimestamp("started_at")));
        dto.setFinishedAt(toOffsetDateTime(rs.getTimestamp("finished_at")));
        return dto;
    }

    private Map<String, Object> readJsonMap(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptyMap();
        }

        try {
            return objectMapper.readValue(raw, new TypeReference<>() {});
        } catch (Exception ignored) {
            return Collections.emptyMap();
        }
    }

    private OffsetDateTime toOffsetDateTime(Timestamp timestamp) {
        if (timestamp == null) {
            return null;
        }

        return timestamp.toInstant().atOffset(ZoneOffset.ofHours(8));
    }
}
