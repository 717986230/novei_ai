package com.novelai.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.novelai.backend.model.BookDto;
import com.novelai.backend.model.ChapterDto;
import com.novelai.backend.model.NovelInfoDto;
import com.novelai.backend.model.SettingsData;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class NovelStorageService {

    private static final ZoneOffset SHANGHAI_OFFSET = ZoneOffset.ofHours(8);

    private final SettingsService settingsService;
    private final JdbcSupportService jdbcSupportService;
    private final BookStorageService bookStorageService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public NovelStorageService(SettingsService settingsService, JdbcSupportService jdbcSupportService, BookStorageService bookStorageService) {
        this.settingsService = settingsService;
        this.jdbcSupportService = jdbcSupportService;
        this.bookStorageService = bookStorageService;
    }

    public String resolveBookKey(String requestedBookKey) {
        if (requestedBookKey != null && !requestedBookKey.isBlank()) {
            String normalized = requestedBookKey.trim();
            if (hasBookData(normalized)) {
                return normalized;
            }
        }

        SettingsData settings = settingsService.readSettings();
        SettingsData.NovelSettings novelSettings = settings.getNovel();
        if (novelSettings != null && novelSettings.getCurrentBookKey() != null && !novelSettings.getCurrentBookKey().isBlank()) {
            String normalized = novelSettings.getCurrentBookKey().trim();
            if (hasBookData(normalized)) {
                return normalized;
            }
        }

        NovelInfoDto latest = findLatestNovelInfo();
        if (latest != null && latest.getCurrentBookKey() != null && !latest.getCurrentBookKey().isBlank()) {
            return latest.getCurrentBookKey();
        }

        String currentBookKey = bookStorageService.getCurrentBookKey();
        if (currentBookKey != null && !currentBookKey.isBlank()) {
            return currentBookKey.trim();
        }

        List<BookDto> books = bookStorageService.listBooks();
        if (!books.isEmpty() && books.get(0).getKey() != null && !books.get(0).getKey().isBlank()) {
            return books.get(0).getKey().trim();
        }

        return null;
    }

    public NovelInfoDto getNovelInfo(String bookKey) {
        String resolvedBookKey = resolveBookKey(bookKey);
        if (resolvedBookKey == null || resolvedBookKey.isBlank()) {
            return null;
        }

        NovelInfoDto fromDb = queryNovelInfo(resolvedBookKey);
        NovelInfoDto fromFile = readNovelInfoFile(resolvedBookKey);

        NovelInfoDto novelInfo = mergeNovelInfo(fromFile, fromDb);
        if (novelInfo == null) {
            novelInfo = fromDb != null ? fromDb : fromFile;
        }

        if (novelInfo == null) {
            return null;
        }

        novelInfo.setCurrentBookKey(resolvedBookKey);
        novelInfo.setStats(buildStatistics(resolvedBookKey));
        return novelInfo;
    }

    public String getOutlineText(String bookKey) {
        String resolvedBookKey = resolveBookKey(bookKey);
        if (resolvedBookKey == null || resolvedBookKey.isBlank()) {
            return "";
        }

        String fileOutline = readTextIfExists(resolveOutlineFile(resolvedBookKey));
        if (fileOutline != null && !fileOutline.isBlank()) {
            return fileOutline;
        }

        JdbcTemplate jdbcTemplate = jdbcTemplate();
        if (jdbcTemplate == null) {
            return "";
        }

        String outputDir = resolveOutputDir(resolvedBookKey);
        List<String> results = jdbcTemplate.query(
            "SELECT outline_json FROM novels WHERE output_dir = ? LIMIT 1",
            (rs, rowNum) -> rs.getString("outline_json"),
            outputDir
        );

        return results.isEmpty() || results.get(0) == null ? "" : results.get(0);
    }

    private String readTextIfExists(Path file) {
        if (file == null || !Files.exists(file)) {
            return "";
        }

        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException ignored) {
            return "";
        }
    }

    public List<String> getEnabledPlatforms() {
        SettingsData settings = settingsService.readSettings();
        Map<String, SettingsData.PlatformSettings> platforms = settings.getPlatforms();
        if (platforms == null || platforms.isEmpty()) {
            return Collections.emptyList();
        }

        List<String> enabled = new ArrayList<>();
        for (Map.Entry<String, SettingsData.PlatformSettings> entry : platforms.entrySet()) {
            Map<String, Object> platform = toMap(entry.getValue());
            if (Boolean.TRUE.equals(platform.get("enabled"))) {
                enabled.add(entry.getKey());
            }
        }

        return enabled;
    }

    public List<ChapterDto> listChapters(String bookKey) {
        String resolvedBookKey = resolveBookKey(bookKey);
        if (resolvedBookKey == null || resolvedBookKey.isBlank()) {
            return Collections.emptyList();
        }

        Map<Integer, ChapterDto> chapters = new LinkedHashMap<>();

        for (ChapterDto chapter : queryChapters(resolvedBookKey)) {
            chapters.put(chapter.getNumber(), chapter);
        }

        for (ChapterDto chapter : readChapterFiles(resolvedBookKey)) {
            chapters.merge(chapter.getNumber(), chapter, this::mergeChapter);
        }

        return chapters.values().stream()
            .filter(Objects::nonNull)
            .sorted(Comparator.comparingInt(chapter -> chapter.getNumber() == null ? 0 : chapter.getNumber()))
            .collect(Collectors.toList());
    }

    public ChapterDto getChapter(String bookKey, int number) {
        String resolvedBookKey = resolveBookKey(bookKey);
        if (resolvedBookKey == null || resolvedBookKey.isBlank()) {
            return null;
        }

        ChapterDto fromDb = queryChapter(resolvedBookKey, number);
        ChapterDto fromFile = readChapterFile(resolvedBookKey, number);
        return mergeChapter(fromDb, fromFile);
    }

    public int getLastChapterNumber(String bookKey) {
        return listChapters(bookKey).stream()
            .map(ChapterDto::getNumber)
            .filter(Objects::nonNull)
            .max(Integer::compareTo)
            .orElse(0);
    }

    public ChapterDto saveChapter(String bookKey, ChapterDto chapter) {
        String resolvedBookKey = resolveBookKey(bookKey);
        if (resolvedBookKey == null || resolvedBookKey.isBlank()) {
            throw new IllegalStateException("未找到可用书籍");
        }

        ChapterDto normalized = sanitizeChapter(chapter);
        if (normalized.getNumber() == null) {
            throw new IllegalArgumentException("章节编号不能为空");
        }

        ChapterDto existing = getChapter(resolvedBookKey, normalized.getNumber());
        ChapterDto next = mergeChapter(normalized, existing);
        if (next.getCreatedAt() == null || next.getCreatedAt().isBlank()) {
            next.setCreatedAt(nowIso());
        }
        if (next.getWordCount() == null || next.getWordCount() <= 0) {
            next.setWordCount(next.getContent() == null ? 0 : next.getContent().length());
        }
        if (next.getPlatforms() == null) {
            next.setPlatforms(new ArrayList<>());
        }
        if (next.getPublishedAt() == null && next.isPublished()) {
            next.setPublishedAt(nowIso());
        }

        writeChapterFile(resolvedBookKey, next);
        upsertChapterRow(resolvedBookKey, next);
        return next;
    }

    public boolean deleteChapter(String bookKey, int number) {
        String resolvedBookKey = resolveBookKey(bookKey);
        if (resolvedBookKey == null || resolvedBookKey.isBlank()) {
            return false;
        }

        Path chapterFile = resolveChapterFile(resolvedBookKey, number);
        try {
            Files.deleteIfExists(chapterFile);
        } catch (IOException ignored) {
        }

        JdbcTemplate jdbcTemplate = jdbcTemplate();
        if (jdbcTemplate != null) {
            jdbcTemplate.update("DELETE FROM chapters WHERE output_dir = ? AND chapter_number = ?", resolveOutputDir(resolvedBookKey), number);
        }

        return true;
    }

    public int repairBook(String bookKey) {
        String resolvedBookKey = resolveBookKey(bookKey);
        if (resolvedBookKey == null || resolvedBookKey.isBlank()) {
            return 0;
        }

        List<ChapterDto> chapters = listChapters(resolvedBookKey);
        for (ChapterDto chapter : chapters) {
            saveChapter(resolvedBookKey, chapter);
        }

        NovelInfoDto novelInfo = getNovelInfo(resolvedBookKey);
        if (novelInfo != null) {
            writeNovelInfoFile(resolvedBookKey, novelInfo);
        }

        String outlineText = getOutlineText(resolvedBookKey);
        if (outlineText != null && !outlineText.isBlank()) {
            writeOutlineFile(resolvedBookKey, outlineText);
        }

        return chapters.size();
    }

    private JdbcTemplate jdbcTemplate() {
        return jdbcSupportService.getJdbcTemplate();
    }

    private boolean hasBookData(String bookKey) {
        if (bookKey == null || bookKey.isBlank()) {
            return false;
        }

        JdbcTemplate jdbcTemplate = jdbcTemplate();
        if (jdbcTemplate != null) {
            String outputDir = resolveOutputDir(bookKey);
            Integer count = jdbcTemplate.query(
                "SELECT COUNT(*) FROM novels WHERE output_dir = ?",
                rs -> rs.next() ? rs.getInt(1) : 0,
                outputDir
            );
            if (count != null && count > 0) {
                return true;
            }
        }

        Path bookDir = resolveBookDir(bookKey);
        return Files.exists(bookDir.resolve("novel.json")) || Files.exists(bookDir.resolve("chapters"));
    }

    private NovelInfoDto findLatestNovelInfo() {
        JdbcTemplate jdbcTemplate = jdbcTemplate();
        if (jdbcTemplate == null) {
            return null;
        }

        List<NovelInfoDto> novels = jdbcTemplate.query(
            "SELECT * FROM novels ORDER BY updated_at DESC LIMIT 1",
            (rs, rowNum) -> mapNovelInfo(rs)
        );

        return novels.isEmpty() ? null : novels.get(0);
    }

    private NovelInfoDto queryNovelInfo(String bookKey) {
        JdbcTemplate jdbcTemplate = jdbcTemplate();
        if (jdbcTemplate == null) {
            return null;
        }

        String outputDir = resolveOutputDir(bookKey);
        List<NovelInfoDto> novels = jdbcTemplate.query(
            "SELECT * FROM novels WHERE output_dir = ? LIMIT 1",
            (rs, rowNum) -> mapNovelInfo(rs),
            outputDir
        );

        return novels.isEmpty() ? null : novels.get(0);
    }

    private NovelInfoDto readNovelInfoFile(String bookKey) {
        Path file = resolveNovelFile(bookKey);
        if (!Files.exists(file)) {
            return null;
        }

        try {
            return objectMapper.readValue(file.toFile(), NovelInfoDto.class);
        } catch (Exception ignored) {
            return null;
        }
    }

    private List<ChapterDto> queryChapters(String bookKey) {
        JdbcTemplate jdbcTemplate = jdbcTemplate();
        if (jdbcTemplate == null) {
            return Collections.emptyList();
        }

        String outputDir = resolveOutputDir(bookKey);
        return jdbcTemplate.query(
            "SELECT * FROM chapters WHERE output_dir = ? ORDER BY chapter_number ASC",
            (rs, rowNum) -> mapChapter(rs),
            outputDir
        );
    }

    private ChapterDto queryChapter(String bookKey, int number) {
        JdbcTemplate jdbcTemplate = jdbcTemplate();
        if (jdbcTemplate == null) {
            return null;
        }

        String outputDir = resolveOutputDir(bookKey);
        List<ChapterDto> chapters = jdbcTemplate.query(
            "SELECT * FROM chapters WHERE output_dir = ? AND chapter_number = ? LIMIT 1",
            (rs, rowNum) -> mapChapter(rs),
            outputDir,
            number
        );

        return chapters.isEmpty() ? null : chapters.get(0);
    }

    private List<ChapterDto> readChapterFiles(String bookKey) {
        Path chaptersDir = resolveChaptersDir(bookKey);
        if (!Files.exists(chaptersDir)) {
            return Collections.emptyList();
        }

        try {
            List<Path> files;
            try (var stream = Files.list(chaptersDir)) {
                files = stream
                    .filter(path -> Files.isRegularFile(path) && path.getFileName().toString().startsWith("chapter_") && path.getFileName().toString().endsWith(".json"))
                    .sorted()
                    .collect(Collectors.toList());
            }

            List<ChapterDto> chapters = new ArrayList<>();
            for (Path file : files) {
                try {
                    chapters.add(sanitizeChapter(objectMapper.readValue(file.toFile(), ChapterDto.class)));
                } catch (Exception ignored) {
                }
            }

            return chapters;
        } catch (IOException ignored) {
            return Collections.emptyList();
        }
    }

    private ChapterDto readChapterFile(String bookKey, int number) {
        Path file = resolveChapterFile(bookKey, number);
        if (!Files.exists(file)) {
            return null;
        }

        try {
            return sanitizeChapter(objectMapper.readValue(file.toFile(), ChapterDto.class));
        } catch (Exception ignored) {
            return null;
        }
    }

    private void writeNovelInfoFile(String bookKey, NovelInfoDto novelInfo) {
        Path file = resolveNovelFile(bookKey);
        ensureParent(file);

        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), novelInfo);
        } catch (Exception ignored) {
        }
    }

    private void writeOutlineFile(String bookKey, String outlineText) {
        Path file = resolveOutlineFile(bookKey);
        ensureParent(file);

        try {
            Files.writeString(file, outlineText, StandardCharsets.UTF_8);
        } catch (IOException ignored) {
        }
    }

    private void writeChapterFile(String bookKey, ChapterDto chapter) {
        Path file = resolveChapterFile(bookKey, chapter.getNumber());
        ensureParent(file);

        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), chapter);
        } catch (Exception error) {
            throw new IllegalStateException("写入章节文件失败: " + error.getMessage(), error);
        }
    }

    private void upsertChapterRow(String bookKey, ChapterDto chapter) {
        JdbcTemplate jdbcTemplate = jdbcTemplate();
        if (jdbcTemplate == null) {
            return;
        }

        String outputDir = resolveOutputDir(bookKey);
        jdbcTemplate.update("""
                INSERT INTO chapters (
                  output_dir, chapter_number, title, content, outline, word_count,
                  created_at, published, published_at, platforms_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  title = VALUES(title),
                  content = VALUES(content),
                  outline = VALUES(outline),
                  word_count = VALUES(word_count),
                  published = VALUES(published),
                  published_at = VALUES(published_at),
                  platforms_json = VALUES(platforms_json),
                  updated_at = VALUES(updated_at)
            """,
            outputDir,
            chapter.getNumber(),
            value(chapter.getTitle()),
            value(chapter.getContent()),
            value(chapter.getOutline()),
            chapter.getWordCount() == null ? 0 : chapter.getWordCount(),
            parseTimestamp(chapter.getCreatedAt()),
            chapter.isPublished() ? 1 : 0,
            parseTimestamp(chapter.getPublishedAt()),
            toJson(chapter.getPlatforms()),
            Timestamp.from(OffsetDateTime.now(SHANGHAI_OFFSET).toInstant())
        );
    }

    private NovelInfoDto mapNovelInfo(ResultSet rs) throws java.sql.SQLException {
        NovelInfoDto dto = new NovelInfoDto();
        dto.setTitle(rs.getString("title"));
        dto.setType(rs.getString("type"));
        dto.setDescription(rs.getString("description"));
        dto.setTargetChapters(nullToInteger(rs.getObject("target_chapters")));
        dto.setWordsPerChapter(nullToInteger(rs.getObject("words_per_chapter")));
        dto.setCreatedAt(toIso(rs.getTimestamp("created_at")));
        dto.setCurrentBookKey(bookKeyFromOutputDir(rs.getString("output_dir")));
        return dto;
    }

    private ChapterDto mapChapter(ResultSet rs) throws java.sql.SQLException {
        ChapterDto dto = new ChapterDto();
        dto.setNumber(rs.getInt("chapter_number"));
        dto.setTitle(rs.getString("title"));
        dto.setContent(rs.getString("content"));
        dto.setOutline(rs.getString("outline"));
        dto.setWordCount(nullToInteger(rs.getObject("word_count")));
        dto.setCreatedAt(toIso(rs.getTimestamp("created_at")));
        dto.setPublished(rs.getBoolean("published"));
        dto.setPublishedAt(toIso(rs.getTimestamp("published_at")));
        dto.setPlatforms(readPlatforms(rs.getString("platforms_json")));
        return sanitizeChapter(dto);
    }

    private Map<String, Object> buildStatistics(String bookKey) {
        List<ChapterDto> chapters = listChapters(bookKey);
        int total = chapters.size();
        int published = (int) chapters.stream().filter(ChapterDto::isPublished).count();
        int totalWords = chapters.stream().mapToInt(chapter -> chapter.getWordCount() == null ? 0 : chapter.getWordCount()).sum();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", total);
        stats.put("published", published);
        stats.put("unpublished", Math.max(0, total - published));
        stats.put("totalWords", totalWords);
        stats.put("averageWords", total > 0 ? Math.round((double) totalWords / total) : 0);
        stats.put("lastChapterNumber", chapters.stream().map(ChapterDto::getNumber).filter(Objects::nonNull).max(Integer::compareTo).orElse(0));
        return stats;
    }

    private NovelInfoDto mergeNovelInfo(NovelInfoDto preferred, NovelInfoDto fallback) {
        if (preferred == null) {
            return fallback;
        }
        if (fallback == null) {
            return preferred;
        }

        NovelInfoDto merged = new NovelInfoDto();
        merged.setTitle(firstNonBlank(preferred.getTitle(), fallback.getTitle()));
        merged.setType(firstNonBlank(preferred.getType(), fallback.getType()));
        merged.setDescription(firstNonBlank(preferred.getDescription(), fallback.getDescription()));
        merged.setTargetChapters(preferred.getTargetChapters() != null ? preferred.getTargetChapters() : fallback.getTargetChapters());
        merged.setWordsPerChapter(preferred.getWordsPerChapter() != null ? preferred.getWordsPerChapter() : fallback.getWordsPerChapter());
        merged.setCreatedAt(firstNonBlank(preferred.getCreatedAt(), fallback.getCreatedAt()));
        merged.setCurrentBookKey(firstNonBlank(preferred.getCurrentBookKey(), fallback.getCurrentBookKey()));
        merged.setStats(!preferred.getStats().isEmpty() ? preferred.getStats() : fallback.getStats());
        return merged;
    }

    private ChapterDto mergeChapter(ChapterDto preferred, ChapterDto fallback) {
        if (preferred == null) {
            return fallback;
        }
        if (fallback == null) {
            return preferred;
        }

        ChapterDto merged = new ChapterDto();
        merged.setNumber(preferred.getNumber() != null ? preferred.getNumber() : fallback.getNumber());
        merged.setTitle(firstNonBlank(preferred.getTitle(), fallback.getTitle()));
        merged.setContent(firstNonBlank(preferred.getContent(), fallback.getContent()));
        merged.setOutline(firstNonBlank(preferred.getOutline(), fallback.getOutline()));
        merged.setWordCount(preferred.getWordCount() != null ? preferred.getWordCount() : fallback.getWordCount());
        merged.setCreatedAt(firstNonBlank(preferred.getCreatedAt(), fallback.getCreatedAt()));
        merged.setPublished(preferred.isPublished() || fallback.isPublished());
        merged.setPublishedAt(firstNonBlank(preferred.getPublishedAt(), fallback.getPublishedAt()));

        List<String> platforms = !preferred.getPlatforms().isEmpty()
            ? preferred.getPlatforms()
            : fallback.getPlatforms();
        merged.setPlatforms(platforms == null ? new ArrayList<>() : new ArrayList<>(platforms));

        return sanitizeChapter(merged);
    }

    private ChapterDto sanitizeChapter(ChapterDto chapter) {
        if (chapter == null) {
            return null;
        }

        ChapterDto sanitized = new ChapterDto();
        sanitized.setNumber(chapter.getNumber());
        if (sanitized.getNumber() == null && chapter.getNumber() != null) {
            sanitized.setNumber(chapter.getNumber());
        }

        sanitized.setTitle(cleanTitle(chapter.getTitle(), chapter.getContent()));
        sanitized.setContent(cleanContent(chapter.getContent()));
        sanitized.setOutline(cleanPlainText(chapter.getOutline()));
        sanitized.setWordCount(chapter.getWordCount() == null ? null : Math.max(0, chapter.getWordCount()));
        sanitized.setCreatedAt(firstNonBlank(chapter.getCreatedAt(), nowIso()));
        sanitized.setPublished(chapter.isPublished());
        sanitized.setPublishedAt(firstNonBlank(chapter.getPublishedAt(), chapter.isPublished() ? nowIso() : null));
        sanitized.setPlatforms(chapter.getPlatforms() == null ? new ArrayList<>() : new ArrayList<>(chapter.getPlatforms()));

        if ((sanitized.getTitle() == null || sanitized.getTitle().isBlank()) && sanitized.getContent() != null) {
            String inferred = inferTitleFromContent(sanitized.getContent());
            if (inferred != null && !inferred.isBlank()) {
                sanitized.setTitle(inferred);
            }
        }

        if (sanitized.getWordCount() == null) {
            sanitized.setWordCount(sanitized.getContent() == null ? 0 : sanitized.getContent().length());
        }

        return sanitized;
    }

    private String cleanTitle(String title, String content) {
        String candidate = cleanPlainText(title);
        if (candidate == null || candidate.isBlank()) {
            return "";
        }

        candidate = candidate
            .replaceAll("(?i)^标题[:：\\s]*", "")
            .replaceAll("(?i)^书名[:：\\s]*", "")
            .replaceAll("(?i)^第\\s*\\d+\\s*章[:：\\s]*", "")
            .replaceAll("^[\"'“”‘’《》【】\\[\\]()]+|[\"'“”‘’《》【】\\[\\)]+$", "")
            .replaceAll("\\s+", "")
            .trim();

        if ((candidate.isBlank() || candidate.length() > 20 || candidate.contains("<") || candidate.contains(">")) && content != null) {
            String inferred = inferTitleFromContent(content);
            if (inferred != null && !inferred.isBlank()) {
                candidate = inferred;
            }
        }

        return candidate;
    }

    private String cleanContent(String content) {
        String candidate = cleanPlainText(content);
        if (candidate == null) {
            return "";
        }

        candidate = candidate
            .replaceAll("(?is)<think>.*?</think>", "")
            .replaceAll("(?is)<think>.*", "")
            .replaceAll("(?i)^正文[:：\\s]*", "")
            .trim();

        return candidate;
    }

    private String cleanPlainText(String text) {
        if (text == null) {
            return "";
        }

        return text.replace("\u0000", "").trim();
    }

    private String inferTitleFromContent(String content) {
        if (content == null || content.isBlank()) {
            return "";
        }

        String[] lines = content.split("\\R");
        for (String line : lines) {
            String candidate = line.trim();
            if (!candidate.isBlank() && candidate.length() <= 20) {
                candidate = candidate
                    .replaceAll("(?i)^标题[:：\\s]*", "")
                    .replaceAll("(?i)^第\\s*\\d+\\s*章[:：\\s]*", "")
                    .trim();
                if (!candidate.isBlank()) {
                    return candidate;
                }
            }
        }

        return "";
    }

    private List<String> readPlatforms(String raw) {
        if (raw == null || raw.isBlank()) {
            return new ArrayList<>();
        }

        try {
            return objectMapper.readValue(raw, new TypeReference<List<String>>() {});
        } catch (Exception ignored) {
            return new ArrayList<>();
        }
    }

    private String toIso(Timestamp timestamp) {
        if (timestamp == null) {
            return null;
        }

        return timestamp.toInstant().atOffset(SHANGHAI_OFFSET).toString();
    }

    private Timestamp parseTimestamp(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            return Timestamp.from(OffsetDateTime.parse(value).toInstant());
        } catch (Exception ignored) {
            return null;
        }
    }

    private Map<String, Object> toMap(Object value) {
        if (value == null) {
            return Collections.emptyMap();
        }

        if (value instanceof Map<?, ?> map) {
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                result.put(String.valueOf(entry.getKey()), entry.getValue());
            }
            return result;
        }

        return objectMapper.convertValue(value, new TypeReference<>() {});
    }

    private String toJson(List<String> platforms) {
        if (platforms == null || platforms.isEmpty()) {
            return null;
        }

        try {
            return objectMapper.writeValueAsString(platforms);
        } catch (Exception ignored) {
            return null;
        }
    }

    private Integer nullToInteger(Object value) {
        if (value == null) {
            return null;
        }

        if (value instanceof Number number) {
            return number.intValue();
        }

        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ignored) {
            return null;
        }
    }

    private void ensureParent(Path file) {
        Path parent = file == null ? null : file.getParent();
        if (parent == null) {
            return;
        }

        try {
            Files.createDirectories(parent);
        } catch (IOException ignored) {
        }
    }

    private String nowIso() {
        return OffsetDateTime.now(SHANGHAI_OFFSET).toString();
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

    private String value(String input) {
        return input == null ? "" : input;
    }

    private String resolveOutputDir(String bookKey) {
        return resolveBookDir(bookKey).toString();
    }

    private String bookKeyFromOutputDir(String outputDir) {
        if (outputDir == null || outputDir.isBlank()) {
            return "";
        }

        try {
            Path path = Paths.get(outputDir);
            Path fileName = path.getFileName();
            return fileName == null ? outputDir : fileName.toString();
        } catch (Exception ignored) {
            return outputDir;
        }
    }

    private Path resolveBaseLibraryDir() {
        SettingsData settings = settingsService.readSettings();
        SettingsData.NovelSettings novelSettings = settings.getNovel();
        String libraryDir = novelSettings != null ? novelSettings.getLibraryDir() : null;
        if (libraryDir == null || libraryDir.isBlank()) {
            String outputDir = novelSettings != null ? novelSettings.getOutputDir() : null;
            if (outputDir == null || outputDir.isBlank()) {
                libraryDir = "./output/books";
            } else {
                libraryDir = Paths.get(outputDir, "books").toString();
            }
        }

        return settingsService.resolveWorkspacePath(libraryDir);
    }

    private String sanitizeBookKey(String bookKey) {
        String normalized = bookKey == null ? "" : bookKey.trim();
        normalized = normalized.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (normalized.isBlank()) {
            normalized = "default";
        }
        return normalized;
    }

    private Path resolveBookDir(String bookKey) {
        return resolveBaseLibraryDir().resolve(sanitizeBookKey(bookKey));
    }

    private Path resolveNovelFile(String bookKey) {
        return resolveBookDir(bookKey).resolve("novel.json");
    }

    private Path resolveOutlineFile(String bookKey) {
        return resolveBookDir(bookKey).resolve("outline.json");
    }

    private Path resolveChaptersDir(String bookKey) {
        return resolveBookDir(bookKey).resolve("chapters");
    }

    private Path resolveChapterFile(String bookKey, int number) {
        return resolveChaptersDir(bookKey).resolve(String.format(Locale.ROOT, "chapter_%04d.json", number));
    }

    public Set<Integer> getPublishedChapterNumbers(String bookKey) {
        return listChapters(bookKey).stream()
            .filter(ChapterDto::isPublished)
            .map(ChapterDto::getNumber)
            .filter(Objects::nonNull)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }
}
