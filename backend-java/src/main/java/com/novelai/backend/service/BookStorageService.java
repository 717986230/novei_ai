package com.novelai.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.novelai.backend.model.BookDto;
import com.novelai.backend.model.ChapterDto;
import com.novelai.backend.model.NovelInfoDto;
import com.novelai.backend.model.SettingsData;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class BookStorageService {

    private final SettingsService settingsService;
    private final JdbcSupportService jdbcSupportService;
    private final ObjectMapper objectMapper;

    public BookStorageService(SettingsService settingsService, JdbcSupportService jdbcSupportService) {
        this.settingsService = settingsService;
        this.jdbcSupportService = jdbcSupportService;
        this.objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    }

    public Path getOutputDir() {
        SettingsData settings = settingsService.readSettings();
        String outputDir = settings.getNovel() != null && settings.getNovel().getOutputDir() != null
            ? settings.getNovel().getOutputDir()
            : "./output";
        return settingsService.resolveWorkspacePath(outputDir);
    }

    public Path getLibraryDir() {
        SettingsData settings = settingsService.readSettings();
        String libraryDir = settings.getNovel() != null && settings.getNovel().getLibraryDir() != null
            ? settings.getNovel().getLibraryDir()
            : getOutputDir().resolve("books").toString();
        return settingsService.resolveWorkspacePath(libraryDir);
    }

    public Path getBookDir(String bookKey) {
        return getLibraryDir().resolve(bookKey);
    }

    public String sanitizeBookKey(String value) {
        String cleaned = value == null ? "" : value.trim()
            .replaceAll("[<>:\"/\\\\|?*\\x00-\\x1f]", "")
            .replaceAll("\\s+", "-")
            .replaceAll("\\.+$", "");

        if (cleaned.length() > 60) {
            cleaned = cleaned.substring(0, 60);
        }

        if (!cleaned.isBlank()) {
            return cleaned;
        }

        return "book-" + System.currentTimeMillis();
    }

    public void ensureInitialized() {
        try {
            Files.createDirectories(getOutputDir());
            Files.createDirectories(getLibraryDir());
            ensureCurrentBookExists();
        } catch (IOException error) {
            throw new IllegalStateException("初始化书库失败: " + error.getMessage(), error);
        }
    }

    public String getCurrentBookKey() {
        ensureInitialized();
        SettingsData settings = settingsService.readSettings();
        String current = settings.getNovel() == null ? "" : safe(settings.getNovel().getCurrentBookKey());
        if (!current.isBlank() && Files.exists(getBookDir(current))) {
            return current;
        }

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(getLibraryDir())) {
            for (Path path : stream) {
                if (Files.isDirectory(path)) {
                    return path.getFileName().toString();
                }
            }
        } catch (IOException error) {
            throw new IllegalStateException("读取当前书籍失败: " + error.getMessage(), error);
        }

        return "";
    }

    public void setCurrentBookKey(String bookKey) {
        SettingsData settings = settingsService.readSettings();
        if (settings.getNovel() == null) {
            settings.setNovel(new SettingsData.NovelSettings());
        }
        settings.getNovel().setCurrentBookKey(bookKey == null ? "" : bookKey);

        try {
            Files.createDirectories(settingsService.resolveSettingsPath().getParent());
            objectMapper.writeValue(settingsService.resolveSettingsPath().toFile(), settings);
        } catch (IOException error) {
            throw new IllegalStateException("保存当前书配置失败: " + error.getMessage(), error);
        }
    }

    public List<BookDto> listBooks() {
        ensureInitialized();
        List<BookDto> books = new ArrayList<>();
        Set<String> keys = new LinkedHashSet<>();

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(getLibraryDir())) {
            for (Path path : stream) {
                if (Files.isDirectory(path)) {
                    keys.add(path.getFileName().toString());
                }
            }
        } catch (IOException error) {
            throw new IllegalStateException("读取书库目录失败: " + error.getMessage(), error);
        }

        JdbcTemplate jdbcTemplate = jdbcSupportService.getJdbcTemplate();
        if (jdbcTemplate != null) {
            List<String> dbKeys = jdbcTemplate.query(
                "SELECT output_dir FROM novels",
                (rs, rowNum) -> Paths.get(rs.getString("output_dir")).getFileName().toString()
            );
            keys.addAll(dbKeys);
        }

        String currentBookKey = getCurrentBookKey();
        for (String key : keys) {
            BookDto book = buildBook(key);
            book.setCurrent(key.equals(currentBookKey));
            books.add(book);
        }

        books.sort(Comparator.comparing(BookDto::getCreatedAt, Comparator.nullsLast(String::compareTo)).reversed());
        return books;
    }

    public BookDto buildBook(String bookKey) {
        NovelInfoDto novelInfo = getNovelInfoByBookKey(bookKey);
        List<ChapterDto> chapters = getChaptersByBookKey(bookKey);

        BookDto dto = new BookDto();
        dto.setKey(bookKey);
        dto.setTitle(novelInfo != null && novelInfo.getTitle() != null ? novelInfo.getTitle() : bookKey);
        dto.setType(novelInfo != null ? safe(novelInfo.getType()) : "");
        dto.setDescription(novelInfo != null ? safe(novelInfo.getDescription()) : "");
        dto.setCreatedAt(novelInfo != null ? novelInfo.getCreatedAt() : null);
        dto.setChapterCount(chapters.size());
        dto.setLastChapterNumber(chapters.isEmpty() ? 0 : chapters.get(chapters.size() - 1).getNumber());
        return dto;
    }

    public BookDto createBook(String title, String type, String description) {
        ensureInitialized();
        String baseKey = sanitizeBookKey(
            !safe(title).isBlank() ? title : (!safe(type).isBlank() ? type : "book")
        );
        String bookKey = baseKey;
        int suffix = 1;
        while (Files.exists(getBookDir(bookKey))) {
            bookKey = baseKey + "-" + suffix;
            suffix += 1;
        }

        try {
            Files.createDirectories(getBookDir(bookKey).resolve("chapters"));
        } catch (IOException error) {
            throw new IllegalStateException("创建书籍目录失败: " + error.getMessage(), error);
        }

        setCurrentBookKey(bookKey);
        BookDto book = new BookDto();
        book.setKey(bookKey);
        book.setTitle(title);
        book.setType(type);
        book.setDescription(description);
        return book;
    }

    public boolean bookExists(String bookKey) {
        if (bookKey == null || bookKey.isBlank()) {
            return false;
        }

        Path bookDir = getBookDir(bookKey);
        if (Files.exists(bookDir)) {
            return true;
        }

        JdbcTemplate jdbcTemplate = jdbcSupportService.getJdbcTemplate();
        if (jdbcTemplate == null) {
            return false;
        }

        Integer novels = jdbcTemplate.query(
            "SELECT COUNT(*) FROM novels WHERE output_dir = ?",
            rs -> rs.next() ? rs.getInt(1) : 0,
            bookDir.toString()
        );
        if (novels != null && novels > 0) {
            return true;
        }

        Integer chapters = jdbcTemplate.query(
            "SELECT COUNT(*) FROM chapters WHERE output_dir = ?",
            rs -> rs.next() ? rs.getInt(1) : 0,
            bookDir.toString()
        );
        return chapters != null && chapters > 0;
    }

    public boolean deleteBook(String bookKey) {
        if (!bookExists(bookKey)) {
            return false;
        }

        Path bookDir = getBookDir(bookKey);
        try {
            if (Files.exists(bookDir)) {
                Files.walk(bookDir)
                    .sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException ignored) {
                        }
                    });
            }
        } catch (IOException error) {
            throw new IllegalStateException("删除书籍目录失败: " + error.getMessage(), error);
        }

        JdbcTemplate jdbcTemplate = jdbcSupportService.getJdbcTemplate();
        if (jdbcTemplate != null) {
            String outputDir = bookDir.toString();
            jdbcTemplate.update("DELETE FROM chapters WHERE output_dir = ?", outputDir);
            jdbcTemplate.update("DELETE FROM novels WHERE output_dir = ?", outputDir);
        }

        if (bookKey.equals(getCurrentBookKey())) {
            List<BookDto> books = listBooks();
            setCurrentBookKey(books.isEmpty() ? "" : books.get(0).getKey());
        }

        return true;
    }

    public NovelInfoDto getCurrentNovelInfo() {
        return getNovelInfoByBookKey(getCurrentBookKey());
    }

    public NovelInfoDto getNovelInfoByBookKey(String bookKey) {
        if (bookKey == null || bookKey.isBlank()) {
            return null;
        }

        String outputDir = getBookDir(bookKey).toString();
        NovelInfoDto dbInfo = readNovelInfoFromDb(outputDir);
        NovelInfoDto fileInfo = readNovelInfoFromFile(bookKey);
        NovelInfoDto result = mergeNovelInfo(fileInfo, dbInfo);
        if (result == null) {
            result = new NovelInfoDto();
        }

        result.setStats(buildStats(getChaptersByBookKey(bookKey)));
        result.setCurrentBookKey(bookKey);
        return result;
    }

    public void saveNovelInfo(String bookKey, NovelInfoDto novelInfo) {
        String outputDir = getBookDir(bookKey).toString();
        novelInfo.setCurrentBookKey(bookKey);

        try {
            Files.createDirectories(getBookDir(bookKey));
            objectMapper.writeValue(getBookDir(bookKey).resolve("novel.json").toFile(), novelInfo);
        } catch (IOException error) {
            throw new IllegalStateException("写入 novel.json 失败: " + error.getMessage(), error);
        }

        JdbcTemplate jdbcTemplate = jdbcSupportService.getJdbcTemplate();
        if (jdbcTemplate != null) {
            jdbcTemplate.update("""
                INSERT INTO novels (
                  output_dir, title, type, description, target_chapters, words_per_chapter, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  title = VALUES(title),
                  type = VALUES(type),
                  description = VALUES(description),
                  target_chapters = VALUES(target_chapters),
                  words_per_chapter = VALUES(words_per_chapter),
                  created_at = VALUES(created_at),
                  updated_at = VALUES(updated_at)
            """,
                outputDir,
                safe(novelInfo.getTitle()),
                safe(novelInfo.getType()),
                safe(novelInfo.getDescription()),
                defaultInt(novelInfo.getTargetChapters()),
                defaultInt(novelInfo.getWordsPerChapter()),
                toTimestamp(novelInfo.getCreatedAt()),
                new Timestamp(System.currentTimeMillis())
            );
        }
    }

    public List<ChapterDto> getCurrentChapters() {
        return getChaptersByBookKey(getCurrentBookKey());
    }

    public List<ChapterDto> getChaptersByBookKey(String bookKey) {
        if (bookKey == null || bookKey.isBlank()) {
            return Collections.emptyList();
        }

        String outputDir = getBookDir(bookKey).toString();
        Map<Integer, ChapterDto> chapterMap = new LinkedHashMap<>();

        JdbcTemplate jdbcTemplate = jdbcSupportService.getJdbcTemplate();
        if (jdbcTemplate != null) {
            List<ChapterDto> dbChapters = jdbcTemplate.query(
                "SELECT * FROM chapters WHERE output_dir = ? ORDER BY chapter_number ASC",
                (rs, rowNum) -> mapChapter(rs),
                outputDir
            );
            dbChapters.forEach(chapter -> chapterMap.put(chapter.getNumber(), sanitizeChapter(chapter)));
        }

        Path chaptersDir = getBookDir(bookKey).resolve("chapters");
        if (Files.exists(chaptersDir)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(chaptersDir, "chapter_*.json")) {
                for (Path file : stream) {
                    ChapterDto chapter = objectMapper.readValue(file.toFile(), ChapterDto.class);
                    chapter = sanitizeChapter(chapter);
                    chapterMap.putIfAbsent(chapter.getNumber(), chapter);
                }
            } catch (IOException error) {
                throw new IllegalStateException("读取章节文件失败: " + error.getMessage(), error);
            }
        }

        return chapterMap.values().stream()
            .sorted(Comparator.comparing(ChapterDto::getNumber))
            .toList();
    }

    public ChapterDto getChapter(String bookKey, Integer number) {
        return getChaptersByBookKey(bookKey).stream()
            .filter(chapter -> chapter.getNumber().equals(number))
            .findFirst()
            .orElse(null);
    }

    public ChapterDto saveChapter(String bookKey, ChapterDto chapter) {
        ChapterDto sanitized = sanitizeChapter(chapter);
        sanitized.setWordCount(sanitized.getContent() == null ? 0 : sanitized.getContent().length());
        if (sanitized.getCreatedAt() == null || sanitized.getCreatedAt().isBlank()) {
            sanitized.setCreatedAt(OffsetDateTime.now().toString());
        }

        Path chapterFile = getBookDir(bookKey).resolve("chapters")
            .resolve(String.format("chapter_%04d.json", sanitized.getNumber()));
        try {
            Files.createDirectories(chapterFile.getParent());
            objectMapper.writeValue(chapterFile.toFile(), sanitized);
        } catch (IOException error) {
            throw new IllegalStateException("写入章节文件失败: " + error.getMessage(), error);
        }

        JdbcTemplate jdbcTemplate = jdbcSupportService.getJdbcTemplate();
        if (jdbcTemplate != null) {
            jdbcTemplate.update("""
                INSERT INTO chapters (
                  output_dir, chapter_number, title, content, outline, word_count, created_at,
                  published, published_at, platforms_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  title = VALUES(title),
                  content = VALUES(content),
                  outline = VALUES(outline),
                  word_count = VALUES(word_count),
                  created_at = VALUES(created_at),
                  published = VALUES(published),
                  published_at = VALUES(published_at),
                  platforms_json = VALUES(platforms_json),
                  updated_at = VALUES(updated_at)
            """,
                getBookDir(bookKey).toString(),
                sanitized.getNumber(),
                safe(sanitized.getTitle()),
                safe(sanitized.getContent()),
                safe(sanitized.getOutline()),
                defaultInt(sanitized.getWordCount()),
                toTimestamp(sanitized.getCreatedAt()),
                sanitized.isPublished() ? 1 : 0,
                sanitized.getPublishedAt() == null ? null : toTimestamp(sanitized.getPublishedAt()),
                writeJson(sanitized.getPlatforms()),
                new Timestamp(System.currentTimeMillis())
            );
        }

        return sanitized;
    }

    public void deleteChapter(String bookKey, Integer number) {
        Path chapterFile = getBookDir(bookKey).resolve("chapters")
            .resolve(String.format("chapter_%04d.json", number));
        try {
            Files.deleteIfExists(chapterFile);
        } catch (IOException error) {
            throw new IllegalStateException("删除章节文件失败: " + error.getMessage(), error);
        }

        JdbcTemplate jdbcTemplate = jdbcSupportService.getJdbcTemplate();
        if (jdbcTemplate != null) {
            jdbcTemplate.update(
                "DELETE FROM chapters WHERE output_dir = ? AND chapter_number = ?",
                getBookDir(bookKey).toString(),
                number
            );
        }
    }

    public void resetBook(String bookKey) {
        Path chaptersDir = getBookDir(bookKey).resolve("chapters");
        try {
            if (Files.exists(chaptersDir)) {
                Files.walk(chaptersDir)
                    .sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        if (!path.equals(chaptersDir)) {
                            try {
                                Files.deleteIfExists(path);
                            } catch (IOException ignored) {
                            }
                        }
                    });
                Files.createDirectories(chaptersDir);
            }
            Files.deleteIfExists(getBookDir(bookKey).resolve("outline.json"));
        } catch (IOException error) {
            throw new IllegalStateException("重置书籍失败: " + error.getMessage(), error);
        }

        JdbcTemplate jdbcTemplate = jdbcSupportService.getJdbcTemplate();
        if (jdbcTemplate != null) {
            jdbcTemplate.update("DELETE FROM chapters WHERE output_dir = ?", getBookDir(bookKey).toString());
            jdbcTemplate.update("UPDATE novels SET outline_json = NULL, updated_at = ? WHERE output_dir = ?",
                new Timestamp(System.currentTimeMillis()), getBookDir(bookKey).toString());
        }
    }

    public int repairBook(String bookKey) {
        List<ChapterDto> chapters = getChaptersByBookKey(bookKey);
        chapters.forEach(chapter -> saveChapter(bookKey, chapter));
        return chapters.size();
    }

    public int publishBook(String bookKey) {
        List<ChapterDto> chapters = getChaptersByBookKey(bookKey);
        int count = 0;
        for (ChapterDto chapter : chapters) {
            if (!chapter.isPublished()) {
                chapter.setPublished(true);
                chapter.setPublishedAt(OffsetDateTime.now().toString());
                saveChapter(bookKey, chapter);
                count += 1;
            }
        }
        return count;
    }

    public int getNextChapterNumber(String bookKey) {
        List<ChapterDto> chapters = getChaptersByBookKey(bookKey);
        return chapters.isEmpty() ? 1 : chapters.get(chapters.size() - 1).getNumber() + 1;
    }

    public int getLastChapterNumber(String bookKey) {
        List<ChapterDto> chapters = getChaptersByBookKey(bookKey);
        return chapters.isEmpty() ? 0 : chapters.get(chapters.size() - 1).getNumber();
    }

    public String getPreviousContent(String bookKey, int chapterNumber) {
        ChapterDto previous = getChapter(bookKey, chapterNumber - 1);
        return previous == null ? "" : safe(previous.getContent());
    }

    private void ensureCurrentBookExists() {
        String currentBookKey = safe(settingsService.readSettings().getNovel() == null ? "" : settingsService.readSettings().getNovel().getCurrentBookKey());
        if (!currentBookKey.isBlank() && Files.exists(getBookDir(currentBookKey))) {
            return;
        }

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(getLibraryDir())) {
            for (Path path : stream) {
                if (Files.isDirectory(path)) {
                    setCurrentBookKey(path.getFileName().toString());
                    return;
                }
            }
        } catch (IOException error) {
            throw new IllegalStateException("校验当前书失败: " + error.getMessage(), error);
        }
    }

    private NovelInfoDto readNovelInfoFromDb(String outputDir) {
        JdbcTemplate jdbcTemplate = jdbcSupportService.getJdbcTemplate();
        if (jdbcTemplate == null) {
            return null;
        }

        List<NovelInfoDto> results = jdbcTemplate.query(
            "SELECT title, type, description, target_chapters, words_per_chapter, created_at FROM novels WHERE output_dir = ? LIMIT 1",
            (rs, rowNum) -> {
                NovelInfoDto dto = new NovelInfoDto();
                dto.setTitle(rs.getString("title"));
                dto.setType(rs.getString("type"));
                dto.setDescription(rs.getString("description"));
                dto.setTargetChapters(rs.getInt("target_chapters"));
                dto.setWordsPerChapter(rs.getInt("words_per_chapter"));
                dto.setCreatedAt(toIsoString(rs.getTimestamp("created_at")));
                return dto;
            },
            outputDir
        );

        return results.isEmpty() ? null : results.get(0);
    }

    private NovelInfoDto readNovelInfoFromFile(String bookKey) {
        Path novelFile = getBookDir(bookKey).resolve("novel.json");
        if (!Files.exists(novelFile)) {
            return null;
        }

        try {
            return objectMapper.readValue(novelFile.toFile(), NovelInfoDto.class);
        } catch (IOException error) {
            return null;
        }
    }

    private NovelInfoDto mergeNovelInfo(NovelInfoDto fileInfo, NovelInfoDto dbInfo) {
        if (fileInfo == null && dbInfo == null) {
            return null;
        }

        NovelInfoDto dto = new NovelInfoDto();
        dto.setTitle(safe(dbInfo != null ? dbInfo.getTitle() : null, fileInfo != null ? fileInfo.getTitle() : null));
        dto.setType(safe(dbInfo != null ? dbInfo.getType() : null, fileInfo != null ? fileInfo.getType() : null));
        dto.setDescription(safe(dbInfo != null ? dbInfo.getDescription() : null, fileInfo != null ? fileInfo.getDescription() : null));
        dto.setTargetChapters(dbInfo != null && dbInfo.getTargetChapters() != null ? dbInfo.getTargetChapters() : fileInfo != null ? fileInfo.getTargetChapters() : 3000);
        dto.setWordsPerChapter(dbInfo != null && dbInfo.getWordsPerChapter() != null ? dbInfo.getWordsPerChapter() : fileInfo != null ? fileInfo.getWordsPerChapter() : 2000);
        dto.setCreatedAt(safe(dbInfo != null ? dbInfo.getCreatedAt() : null, fileInfo != null ? fileInfo.getCreatedAt() : null));
        return dto;
    }

    private Map<String, Object> buildStats(List<ChapterDto> chapters) {
        int total = chapters.size();
        int published = (int) chapters.stream().filter(ChapterDto::isPublished).count();
        int totalWords = chapters.stream().map(ChapterDto::getWordCount).filter(i -> i != null).mapToInt(Integer::intValue).sum();

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", total);
        stats.put("published", published);
        stats.put("unpublished", total - published);
        stats.put("totalWords", totalWords);
        stats.put("averageWords", total == 0 ? 0 : Math.round((float) totalWords / total));
        stats.put("lastChapterNumber", chapters.isEmpty() ? 0 : chapters.get(chapters.size() - 1).getNumber());
        return stats;
    }

    private ChapterDto mapChapter(ResultSet rs) throws java.sql.SQLException {
        ChapterDto chapter = new ChapterDto();
        chapter.setNumber(rs.getInt("chapter_number"));
        chapter.setTitle(rs.getString("title"));
        chapter.setContent(rs.getString("content"));
        chapter.setOutline(rs.getString("outline"));
        chapter.setWordCount(rs.getInt("word_count"));
        chapter.setCreatedAt(toIsoString(rs.getTimestamp("created_at")));
        chapter.setPublished(rs.getBoolean("published"));
        chapter.setPublishedAt(toIsoString(rs.getTimestamp("published_at")));
        chapter.setPlatforms(readStringList(rs.getString("platforms_json")));
        return chapter;
    }

    private List<String> readStringList(String raw) {
        if (raw == null || raw.isBlank()) {
            return new ArrayList<>();
        }

        try {
            return objectMapper.readValue(raw, new TypeReference<>() {});
        } catch (IOException ignored) {
            return new ArrayList<>();
        }
    }

    private ChapterDto sanitizeChapter(ChapterDto chapter) {
        if (chapter == null) {
            return null;
        }

        chapter.setTitle(stripThinking(safe(chapter.getTitle())).replaceFirst("^标题[:：]\\s*", "").strip());
        chapter.setContent(stripThinking(safe(chapter.getContent())).strip());
        chapter.setOutline(safe(chapter.getOutline()));
        chapter.setPlatforms(chapter.getPlatforms() == null ? new ArrayList<>() : chapter.getPlatforms());
        chapter.setWordCount(chapter.getWordCount() == null || chapter.getWordCount() == 0
            ? chapter.getContent().length()
            : chapter.getWordCount());
        if ((chapter.getTitle() == null || chapter.getTitle().isBlank()) && chapter.getContent() != null) {
            String[] lines = chapter.getContent().split("\\R");
            if (lines.length > 0) {
                chapter.setTitle(lines[0].replaceFirst("^#\\s*", "").trim());
            }
        }
        return chapter;
    }

    private String stripThinking(String text) {
        return text
            .replaceAll("(?is)<think>[\\s\\S]*?</think>", "")
            .replaceAll("(?is)<think>[\\s\\S]*", "");
    }

    private String writeJson(Object data) {
        try {
            return objectMapper.writeValueAsString(data);
        } catch (IOException error) {
            return "[]";
        }
    }

    private Timestamp toTimestamp(String isoString) {
        if (isoString == null || isoString.isBlank()) {
            return new Timestamp(System.currentTimeMillis());
        }

        try {
            return Timestamp.from(OffsetDateTime.parse(isoString).toInstant());
        } catch (Exception ignored) {
            return new Timestamp(System.currentTimeMillis());
        }
    }

    private String toIsoString(Timestamp timestamp) {
        if (timestamp == null) {
            return null;
        }

        return timestamp.toInstant().atOffset(ZoneOffset.ofHours(8)).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private int defaultInt(Integer value) {
        return value == null ? 0 : value;
    }

    private String safe(String... values) {
        for (String value : values) {
            if (value != null) {
                return value;
            }
        }
        return "";
    }
}
