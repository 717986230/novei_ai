package com.novelai.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.novelai.backend.model.WorkflowDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Service
public class WorkflowReadService {

    private final JdbcSupportService jdbcSupportService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public WorkflowReadService(JdbcSupportService jdbcSupportService) {
        this.jdbcSupportService = jdbcSupportService;
    }

    public List<WorkflowDto> list(String bookKey) {
        JdbcTemplate jdbcTemplate = jdbcTemplate();
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
        JdbcTemplate jdbcTemplate = jdbcTemplate();
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

    public WorkflowDto findActiveWorkflow(String bookKey) {
        JdbcTemplate jdbcTemplate = jdbcTemplate();
        if (jdbcTemplate == null || bookKey == null || bookKey.isBlank()) {
            return null;
        }

        List<WorkflowDto> results = jdbcTemplate.query(
            "SELECT * FROM workflows WHERE book_key = ? AND status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1",
            (rs, rowNum) -> mapWorkflow(rs),
            bookKey
        );

        return results.isEmpty() ? null : results.get(0);
    }

    public WorkflowDto saveWorkflow(WorkflowDto workflow) {
        JdbcTemplate jdbcTemplate = jdbcTemplate();
        if (jdbcTemplate == null || workflow == null || workflow.getId() == null || workflow.getId().isBlank()) {
            return workflow;
        }

        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.ofHours(8));
        OffsetDateTime createdAt = workflow.getCreatedAt() == null ? now : workflow.getCreatedAt();
        OffsetDateTime startedAt = workflow.getStartedAt();
        OffsetDateTime finishedAt = workflow.getFinishedAt();

        jdbcTemplate.update("""
                INSERT INTO workflows (
                  id, book_key, type, title, status,
                  payload_json, progress_json, result_json, error_text,
                  created_at, started_at, finished_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  book_key = VALUES(book_key),
                  type = VALUES(type),
                  title = VALUES(title),
                  status = VALUES(status),
                  payload_json = VALUES(payload_json),
                  progress_json = VALUES(progress_json),
                  result_json = VALUES(result_json),
                  error_text = VALUES(error_text),
                  created_at = VALUES(created_at),
                  started_at = VALUES(started_at),
                  finished_at = VALUES(finished_at),
                  updated_at = VALUES(updated_at)
            """,
            workflow.getId(),
            value(workflow.getBookKey()),
            value(workflow.getType()),
            value(workflow.getTitle()),
            value(workflow.getStatus()),
            toJson(workflow.getPayload()),
            toJson(workflow.getProgress()),
            toJson(workflow.getResult()),
            value(workflow.getError()),
            Timestamp.from(createdAt.toInstant()),
            startedAt == null ? null : Timestamp.from(startedAt.toInstant()),
            finishedAt == null ? null : Timestamp.from(finishedAt.toInstant()),
            Timestamp.from(now.toInstant())
        );

        return workflow;
    }

    public int markIncompleteWorkflowsFailed(String errorText) {
        JdbcTemplate jdbcTemplate = jdbcTemplate();
        if (jdbcTemplate == null) {
            return 0;
        }

        return jdbcTemplate.update(
            "UPDATE workflows SET status = 'failed', error_text = ?, finished_at = NOW(), updated_at = NOW() WHERE status IN ('pending', 'running')",
            errorText == null || errorText.isBlank() ? "服务重启，中断了之前的任务" : errorText
        );
    }

    private JdbcTemplate jdbcTemplate() {
        return jdbcSupportService.getJdbcTemplate();
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

    private String toJson(Map<String, Object> value) {
        if (value == null || value.isEmpty()) {
            return null;
        }

        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ignored) {
            return null;
        }
    }

    private OffsetDateTime toOffsetDateTime(Timestamp timestamp) {
        if (timestamp == null) {
            return null;
        }

        return timestamp.toInstant().atOffset(ZoneOffset.ofHours(8));
    }

    private String value(String input) {
        return input == null ? "" : input;
    }
}
