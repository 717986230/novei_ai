package com.novelai.backend.service;

import com.novelai.backend.model.BookDto;
import com.novelai.backend.model.BookUpsertRequest;
import com.novelai.backend.model.BooksResponse;
import com.novelai.backend.model.ChapterDto;
import com.novelai.backend.model.ChapterUpdateRequest;
import com.novelai.backend.model.NovelInfoDto;
import com.novelai.backend.model.OperationResult;
import com.novelai.backend.model.PublishResponse;
import com.novelai.backend.model.RepairDataResponse;
import com.novelai.backend.model.SettingsData;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class BookWorkspaceService {

    private final BookStorageService bookStorageService;
    private final SettingsService settingsService;

    public BookWorkspaceService(BookStorageService bookStorageService, SettingsService settingsService) {
        this.bookStorageService = bookStorageService;
        this.settingsService = settingsService;
    }

    public BooksResponse listBooks() {
        BooksResponse response = new BooksResponse();
        List<BookDto> books = bookStorageService.listBooks();
        String currentBookKey = bookStorageService.getCurrentBookKey();
        if ((currentBookKey == null || currentBookKey.isBlank()) && !books.isEmpty()) {
            currentBookKey = books.get(0).getKey();
            bookStorageService.setCurrentBookKey(currentBookKey);
        }
        response.setBooks(books);
        response.setCurrentBookKey(currentBookKey == null ? "" : currentBookKey);
        return response;
    }

    public BookDto createBook(BookUpsertRequest request) {
        String title = firstNonBlank(request == null ? null : request.getTitle(), "未命名小说");
        String type = firstNonBlank(
            request == null ? null : request.getType(),
            request == null ? null : request.getNovelType(),
            request == null ? null : request.getGenre()
        );
        String description = request == null ? "" : safe(request.getDescription());

        BookDto created = bookStorageService.createBook(title, type, description);

        NovelInfoDto novelInfo = new NovelInfoDto();
        novelInfo.setTitle(title);
        novelInfo.setType(type);
        novelInfo.setDescription(description);
        novelInfo.setTargetChapters(resolveTargetChapters(request, null));
        novelInfo.setWordsPerChapter(resolveWordsPerChapter(request, null));
        novelInfo.setCreatedAt(OffsetDateTime.now().toString());

        bookStorageService.saveNovelInfo(created.getKey(), novelInfo);
        return bookStorageService.buildBook(created.getKey());
    }

    public OperationResult selectBook(String bookKey) {
        if (bookKey == null || bookKey.isBlank()) {
            return OperationResult.failure("缺少 bookKey");
        }

        String normalizedBookKey = bookKey.trim();
        if (!bookStorageService.bookExists(normalizedBookKey)) {
            return OperationResult.failure("书籍不存在");
        }

        bookStorageService.setCurrentBookKey(normalizedBookKey);
        return OperationResult.success();
    }

    public OperationResult deleteBook(String bookKey) {
        if (bookKey == null || bookKey.isBlank()) {
            return OperationResult.failure("缺少 bookKey");
        }

        boolean deleted = bookStorageService.deleteBook(bookKey.trim());
        return deleted ? OperationResult.success() : OperationResult.failure("书籍不存在");
    }

    public NovelInfoDto getNovelInfo() {
        NovelInfoDto novelInfo = bookStorageService.getCurrentNovelInfo();
        if (novelInfo == null) {
            novelInfo = new NovelInfoDto();
            novelInfo.setCurrentBookKey(bookStorageService.getCurrentBookKey());
            novelInfo.setStats(defaultStats(0));
        } else if (novelInfo.getStats() == null || novelInfo.getStats().isEmpty()) {
            novelInfo.setStats(defaultStats(bookStorageService.getLastChapterNumber(novelInfo.getCurrentBookKey())));
        }
        return novelInfo;
    }

    public NovelInfoDto getNovelInfoByBookKey(String bookKey) {
        NovelInfoDto novelInfo = bookStorageService.getNovelInfoByBookKey(firstNonBlank(bookKey, bookStorageService.getCurrentBookKey()));
        if (novelInfo == null) {
            novelInfo = new NovelInfoDto();
            novelInfo.setCurrentBookKey(firstNonBlank(bookKey, bookStorageService.getCurrentBookKey()));
            novelInfo.setStats(defaultStats(0));
        }
        return novelInfo;
    }

    public BookDto saveCurrentNovel(BookUpsertRequest request) {
        String targetBookKey = firstNonBlank(
            request == null ? null : request.getBookKey(),
            request == null ? null : request.getKey(),
            bookStorageService.getCurrentBookKey()
        );
        if (targetBookKey == null || targetBookKey.isBlank()) {
            return createBook(request);
        }
        if (!bookStorageService.bookExists(targetBookKey)) {
            throw new IllegalArgumentException("涔︾睄涓嶅瓨鍦?");
        }

        NovelInfoDto existing = bookStorageService.getNovelInfoByBookKey(targetBookKey);
        NovelInfoDto novelInfo = new NovelInfoDto();
        novelInfo.setTitle(firstNonBlank(request == null ? null : request.getTitle(), existing == null ? null : existing.getTitle(), targetBookKey));
        novelInfo.setType(firstNonBlank(
            request == null ? null : request.getType(),
            request == null ? null : request.getNovelType(),
            request == null ? null : request.getGenre(),
            existing == null ? null : existing.getType()
        ));
        novelInfo.setDescription(firstNonBlank(request == null ? null : request.getDescription(), existing == null ? null : existing.getDescription()));
        novelInfo.setTargetChapters(resolveTargetChapters(request, existing));
        novelInfo.setWordsPerChapter(resolveWordsPerChapter(request, existing));
        novelInfo.setCreatedAt(existing != null && existing.getCreatedAt() != null ? existing.getCreatedAt() : OffsetDateTime.now().toString());

        bookStorageService.setCurrentBookKey(targetBookKey);
        bookStorageService.saveNovelInfo(targetBookKey, novelInfo);
        return bookStorageService.buildBook(targetBookKey);
    }

    public List<ChapterDto> listChapters() {
        return bookStorageService.getCurrentChapters();
    }

    public List<ChapterDto> listChapters(String bookKey) {
        String targetBookKey = resolveExistingBookKey(bookKey);
        if (targetBookKey == null) {
            return List.of();
        }
        return bookStorageService.getChaptersByBookKey(targetBookKey);
    }

    public ChapterDto getChapter(int number) {
        return bookStorageService.getChapter(bookStorageService.getCurrentBookKey(), number);
    }

    public ChapterDto getChapter(String bookKey, int number) {
        String targetBookKey = resolveExistingBookKey(bookKey);
        if (targetBookKey == null) {
            return null;
        }
        return bookStorageService.getChapter(targetBookKey, number);
    }

    public ChapterDto updateChapter(int number, ChapterUpdateRequest request) {
        ChapterDto existing = getChapter(number);
        if (existing == null) {
            return null;
        }

        if (request != null) {
            if (request.getTitle() != null) {
                existing.setTitle(request.getTitle());
            }
            if (request.getContent() != null) {
                existing.setContent(request.getContent());
            }
            if (request.getOutline() != null) {
                existing.setOutline(request.getOutline());
            }
        }

        return bookStorageService.saveChapter(bookStorageService.getCurrentBookKey(), existing);
    }

    public ChapterDto updateChapter(String bookKey, int number, ChapterUpdateRequest request) {
        String targetBookKey = resolveExistingBookKey(bookKey);
        if (targetBookKey == null) {
            return null;
        }

        ChapterDto existing = bookStorageService.getChapter(targetBookKey, number);
        if (existing == null) {
            return null;
        }

        if (request != null) {
            if (request.getTitle() != null) {
                existing.setTitle(request.getTitle());
            }
            if (request.getContent() != null) {
                existing.setContent(request.getContent());
            }
            if (request.getOutline() != null) {
                existing.setOutline(request.getOutline());
            }
        }

        bookStorageService.setCurrentBookKey(targetBookKey);
        return bookStorageService.saveChapter(targetBookKey, existing);
    }

    public boolean deleteChapter(int number) {
        ChapterDto existing = getChapter(number);
        if (existing == null) {
            return false;
        }

        bookStorageService.deleteChapter(bookStorageService.getCurrentBookKey(), number);
        return true;
    }

    public boolean deleteChapter(String bookKey, int number) {
        String targetBookKey = resolveExistingBookKey(bookKey);
        if (targetBookKey == null) {
            return false;
        }

        ChapterDto existing = bookStorageService.getChapter(targetBookKey, number);
        if (existing == null) {
            return false;
        }

        bookStorageService.setCurrentBookKey(targetBookKey);
        bookStorageService.deleteChapter(targetBookKey, number);
        return true;
    }

    public boolean resetBook() {
        String bookKey = bookStorageService.getCurrentBookKey();
        if (bookKey == null || bookKey.isBlank()) {
            return false;
        }

        bookStorageService.resetBook(bookKey);
        return true;
    }

    public boolean resetBook(String bookKey) {
        String targetBookKey = resolveExistingBookKey(bookKey);
        if (targetBookKey == null) {
            return false;
        }

        bookStorageService.setCurrentBookKey(targetBookKey);
        bookStorageService.resetBook(targetBookKey);
        return true;
    }

    public RepairDataResponse repairData(String bookKey) {
        String targetBookKey = resolveExistingBookKey(bookKey);
        if (targetBookKey == null) {
            RepairDataResponse response = new RepairDataResponse();
            response.setSuccess(false);
            response.setError("请先选择一本书");
            return response;
        }

        int repaired = bookStorageService.repairBook(targetBookKey);
        RepairDataResponse response = new RepairDataResponse();
        response.setSuccess(true);
        response.setMessage("数据修复完成");
        response.setRepaired(repaired);
        response.setLastChapterNumber(bookStorageService.getLastChapterNumber(targetBookKey));
        return response;
    }

    public PublishResponse publish(String bookKey) {
        String targetBookKey = resolveExistingBookKey(bookKey);
        if (targetBookKey == null) {
            PublishResponse response = new PublishResponse();
            response.setSuccess(false);
            response.setError("请先选择一本书");
            return response;
        }

        List<ChapterDto> chapters = bookStorageService.getChaptersByBookKey(targetBookKey);
        List<ChapterDto> unpublished = chapters.stream()
            .filter(chapter -> !chapter.isPublished())
            .toList();

        PublishResponse response = new PublishResponse();
        response.setTotal(unpublished.size());
        if (unpublished.isEmpty()) {
            response.setSuccess(false);
            response.setError("没有待发布的章节");
            response.setFailed(0);
            response.setResults(new ArrayList<>());
            return response;
        }

        int published = bookStorageService.publishBook(targetBookKey);
        List<Map<String, Object>> results = new ArrayList<>();
        for (ChapterDto chapter : unpublished) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("success", true);
            item.put("chapter", chapter.getNumber());
            item.put("title", chapter.getTitle());
            results.add(item);
        }

        response.setSuccess(published > 0);
        response.setMessage("发布完成");
        response.setCount(published);
        response.setFailed(Math.max(0, unpublished.size() - published));
        response.setResults(results);
        return response;
    }

    public String getCurrentBookKey() {
        return bookStorageService.getCurrentBookKey();
    }

    private String resolveExistingBookKey(String bookKey) {
        String targetBookKey = firstNonBlank(bookKey, bookStorageService.getCurrentBookKey());
        if (targetBookKey == null || targetBookKey.isBlank()) {
            return null;
        }
        return bookStorageService.bookExists(targetBookKey) ? targetBookKey : null;
    }

    private Map<String, Object> defaultStats(int lastChapterNumber) {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", 0);
        stats.put("published", 0);
        stats.put("unpublished", 0);
        stats.put("totalWords", 0);
        stats.put("averageWords", 0);
        stats.put("lastChapterNumber", lastChapterNumber);
        return stats;
    }

    private Integer resolveTargetChapters(BookUpsertRequest request, NovelInfoDto existing) {
        if (request != null && request.getChapterCount() != null && request.getChapterCount() > 0) {
            return request.getChapterCount();
        }
        if (existing != null && existing.getTargetChapters() != null && existing.getTargetChapters() > 0) {
            return existing.getTargetChapters();
        }

        SettingsData settings = settingsService.readSettings();
        if (settings.getNovel() != null && settings.getNovel().getDefaultChapterCount() != null && settings.getNovel().getDefaultChapterCount() > 0) {
            return settings.getNovel().getDefaultChapterCount();
        }

        return 100;
    }

    private Integer resolveWordsPerChapter(BookUpsertRequest request, NovelInfoDto existing) {
        if (request != null && request.getWordsPerChapter() != null && request.getWordsPerChapter() > 0) {
            return clampWordsPerChapter(request.getWordsPerChapter());
        }
        if (existing != null && existing.getWordsPerChapter() != null && existing.getWordsPerChapter() > 0) {
            return clampWordsPerChapter(existing.getWordsPerChapter());
        }

        SettingsData settings = settingsService.readSettings();
        if (settings.getNovel() != null && settings.getNovel().getWordsPerChapter() != null && settings.getNovel().getWordsPerChapter() > 0) {
            return clampWordsPerChapter(settings.getNovel().getWordsPerChapter());
        }

        return 2000;
    }

    private Integer clampWordsPerChapter(Integer value) {
        if (value == null) {
            return 2000;
        }
        return Math.max(2000, Math.min(6000, value));
    }

    private String safe(String value) {
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
}
