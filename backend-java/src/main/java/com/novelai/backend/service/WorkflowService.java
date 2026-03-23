package com.novelai.backend.service;

import com.novelai.backend.model.ChapterDto;
import com.novelai.backend.model.GenerateWorkflowRequest;
import com.novelai.backend.model.NovelInfoDto;
import com.novelai.backend.model.PublishRequest;
import com.novelai.backend.model.RepairDataRequest;
import com.novelai.backend.model.WorkflowDto;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Service
public class WorkflowService {

    private static final ZoneOffset SHANGHAI_OFFSET = ZoneOffset.ofHours(8);
    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(2, new WorkflowThreadFactory());

    private final WorkflowReadService workflowReadService;
    private final BookStorageService bookStorageService;
    private final AiGenerationService aiGenerationService;

    public WorkflowService(
        WorkflowReadService workflowReadService,
        BookStorageService bookStorageService,
        AiGenerationService aiGenerationService
    ) {
        this.workflowReadService = workflowReadService;
        this.bookStorageService = bookStorageService;
        this.aiGenerationService = aiGenerationService;
    }

    @PostConstruct
    public void initialize() {
        workflowReadService.markIncompleteWorkflowsFailed("服务重启，中断了之前的任务");
    }

    public WorkflowDto generateNextChapter(GenerateWorkflowRequest request) {
        GenerateWorkflowRequest normalized = request == null ? new GenerateWorkflowRequest() : request;
        normalized.setCount(1);
        return createWorkflow("generate-next-chapter", "生成下一章", normalized, 1);
    }

    public WorkflowDto generateChapters(GenerateWorkflowRequest request) {
        GenerateWorkflowRequest normalized = request == null ? new GenerateWorkflowRequest() : request;
        int count = normalized.getCount() == null || normalized.getCount() <= 0 ? 3 : Math.min(20, normalized.getCount());
        normalized.setCount(count);
        return createWorkflow("generate-chapters", "批量生成章节", normalized, count);
    }

    public WorkflowDto repairData(RepairDataRequest request) {
        RepairDataRequest normalized = request == null ? new RepairDataRequest() : request;
        return createWorkflow("repair-data", "修复数据", normalized, 1);
    }

    public WorkflowDto publish(PublishRequest request) {
        PublishRequest normalized = request == null ? new PublishRequest() : request;
        return createWorkflow("publish", "发布章节", normalized, 1);
    }

    private WorkflowDto createWorkflow(String type, String title, Object payloadSource, int total) {
        String bookKey = resolveBookKey(extractBookKey(payloadSource));
        WorkflowDto existing = workflowReadService.findActiveWorkflow(bookKey);
        if (existing != null) {
            return existing;
        }

        WorkflowDto workflow = new WorkflowDto();
        workflow.setId(UUID.randomUUID().toString());
        workflow.setBookKey(bookKey);
        workflow.setType(type);
        workflow.setTitle(title);
        workflow.setStatus("pending");
        workflow.setPayload(buildPayload(type, bookKey, payloadSource));
        workflow.setProgress(buildProgress(0, Math.max(total, 1), "工作流已创建"));
        workflow.setResult(new LinkedHashMap<>());
        workflow.setCreatedAt(now());
        workflowReadService.saveWorkflow(workflow);

        EXECUTOR.submit(() -> executeWorkflow(workflow.getId()));
        return workflowReadService.get(workflow.getId());
    }

    private void executeWorkflow(String workflowId) {
        WorkflowDto workflow = workflowReadService.get(workflowId);
        if (workflow == null) {
            return;
        }

        workflow.setStatus("running");
        workflow.setStartedAt(now());
        workflow.setProgress(buildProgress(0, totalFromPayload(workflow), "工作流执行中"));
        workflowReadService.saveWorkflow(workflow);

        try {
            switch (workflow.getType()) {
                case "generate-next-chapter" -> executeGeneration(workflow, 1);
                case "generate-chapters" -> executeGeneration(workflow, sanitizeCount(workflow, 3));
                case "repair-data" -> executeRepair(workflow);
                case "publish" -> executePublish(workflow);
                default -> throw new IllegalArgumentException("不支持的工作流类型: " + workflow.getType());
            }

            workflow.setStatus("succeeded");
            workflow.setFinishedAt(now());
            workflow.setProgress(buildProgress(totalFromPayload(workflow), totalFromPayload(workflow), "工作流已完成"));
            workflowReadService.saveWorkflow(workflow);
        } catch (Exception error) {
            workflow.setStatus("failed");
            workflow.setFinishedAt(now());
            workflow.setError(error.getMessage() == null ? "工作流执行失败" : error.getMessage());
            workflow.setProgress(buildProgress(currentFromProgress(workflow), totalFromPayload(workflow), workflow.getError()));
            workflowReadService.saveWorkflow(workflow);
        }
    }

    private void executeGeneration(WorkflowDto workflow, int count) {
        String bookKey = workflow.getBookKey();
        NovelInfoDto novelInfo = bookStorageService.getNovelInfoByBookKey(bookKey);
        if (novelInfo == null) {
            throw new IllegalStateException("当前书籍不存在，无法生成章节");
        }

        List<Map<String, Object>> chapters = new ArrayList<>();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("bookKey", bookKey);
        result.put("count", count);
        result.put("chapters", chapters);
        workflow.setResult(result);
        workflowReadService.saveWorkflow(workflow);

        for (int index = 0; index < count; index += 1) {
            int nextNumber = bookStorageService.getNextChapterNumber(bookKey);
            String previousContent = bookStorageService.getPreviousContent(bookKey, nextNumber);
            String chapterTitle = aiGenerationService.generateChapterTitle(novelInfo, nextNumber, "");
            String chapterContent = aiGenerationService.generateChapterContent(novelInfo, nextNumber, chapterTitle, previousContent, "");

            ChapterDto chapter = new ChapterDto();
            chapter.setNumber(nextNumber);
            chapter.setTitle(chapterTitle);
            chapter.setContent(chapterContent);
            chapter.setOutline("");
            chapter.setPublished(false);
            chapter.setPlatforms(new ArrayList<>());
            chapter.setCreatedAt(now().toString());

            ChapterDto saved = bookStorageService.saveChapter(bookKey, chapter);

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("number", saved.getNumber());
            item.put("title", saved.getTitle());
            item.put("wordCount", saved.getWordCount());
            chapters.add(item);

            workflow.getResult().put("generatedCount", chapters.size());
            workflow.getResult().put("lastChapterNumber", saved.getNumber());
            workflow.getResult().put("lastChapterTitle", saved.getTitle());
            workflow.setProgress(buildProgress(chapters.size(), count, "已生成第 " + saved.getNumber() + " 章"));
            workflowReadService.saveWorkflow(workflow);
        }
    }

    private void executeRepair(WorkflowDto workflow) {
        String bookKey = workflow.getBookKey();
        List<ChapterDto> chapters = bookStorageService.getChaptersByBookKey(bookKey);
        List<Map<String, Object>> repaired = new ArrayList<>();

        workflow.setResult(new LinkedHashMap<>(Map.of("bookKey", bookKey, "chapters", repaired)));
        workflowReadService.saveWorkflow(workflow);

        int total = Math.max(chapters.size(), 1);
        int current = 0;
        for (ChapterDto chapter : chapters) {
            ChapterDto saved = bookStorageService.saveChapter(bookKey, chapter);
            repaired.add(Map.of("number", saved.getNumber(), "title", saved.getTitle()));
            current += 1;
            workflow.setProgress(buildProgress(current, total, "已修复第 " + saved.getNumber() + " 章"));
            workflowReadService.saveWorkflow(workflow);
        }

        workflow.getResult().put("repairedCount", repaired.size());
        workflowReadService.saveWorkflow(workflow);
    }

    private void executePublish(WorkflowDto workflow) {
        String bookKey = workflow.getBookKey();
        Map<String, Object> payload = workflow.getPayload() == null ? Map.of() : workflow.getPayload();
        List<Integer> chapterNumbers = extractIntegerList(payload.get("chapterNumbers"));
        List<String> platforms = extractStringList(payload.get("platforms"));

        List<ChapterDto> targets = bookStorageService.getChaptersByBookKey(bookKey).stream()
            .filter(chapter -> chapterNumbers.isEmpty() || chapterNumbers.contains(chapter.getNumber()))
            .filter(chapter -> !chapter.isPublished())
            .collect(Collectors.toList());

        List<Map<String, Object>> published = new ArrayList<>();
        workflow.setResult(new LinkedHashMap<>(Map.of("bookKey", bookKey, "platforms", platforms, "chapters", published)));
        workflowReadService.saveWorkflow(workflow);

        int total = Math.max(targets.size(), 1);
        int current = 0;
        for (ChapterDto chapter : targets) {
            chapter.setPublished(true);
            chapter.setPublishedAt(now().toString());
            chapter.setPlatforms(platforms);
            ChapterDto saved = bookStorageService.saveChapter(bookKey, chapter);
            published.add(Map.of("number", saved.getNumber(), "title", saved.getTitle()));
            current += 1;
            workflow.setProgress(buildProgress(current, total, "已标记发布第 " + saved.getNumber() + " 章"));
            workflowReadService.saveWorkflow(workflow);
        }

        workflow.getResult().put("publishedCount", published.size());
        workflowReadService.saveWorkflow(workflow);
    }

    private Map<String, Object> buildPayload(String type, String bookKey, Object payloadSource) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", type);
        payload.put("bookKey", bookKey);

        if (payloadSource instanceof GenerateWorkflowRequest request) {
            payload.put("count", request.getCount() == null ? 1 : request.getCount());
        } else if (payloadSource instanceof PublishRequest request) {
            payload.put("chapterNumbers", request.getChapterNumbers() == null ? List.of() : request.getChapterNumbers());
            payload.put("platforms", request.getPlatforms() == null ? List.of() : request.getPlatforms());
        }

        return payload;
    }

    private String resolveBookKey(String bookKey) {
        if (bookKey != null && !bookKey.isBlank()) {
            return bookKey.trim();
        }
        return bookStorageService.getCurrentBookKey();
    }

    private String extractBookKey(Object payloadSource) {
        if (payloadSource instanceof GenerateWorkflowRequest request) {
            return request.getBookKey();
        }
        if (payloadSource instanceof RepairDataRequest request) {
            return request.getBookKey();
        }
        if (payloadSource instanceof PublishRequest request) {
            return request.getBookKey();
        }
        return null;
    }

    private int sanitizeCount(WorkflowDto workflow, int fallback) {
        return Math.max(1, Math.min(20, numberValue(workflow.getPayload() == null ? null : workflow.getPayload().get("count"), fallback)));
    }

    private int totalFromPayload(WorkflowDto workflow) {
        return Math.max(1, numberValue(workflow.getPayload() == null ? null : workflow.getPayload().get("count"), 1));
    }

    private int currentFromProgress(WorkflowDto workflow) {
        return numberValue(workflow.getProgress() == null ? null : workflow.getProgress().get("current"), 0);
    }

    private int numberValue(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value != null) {
            try {
                return Integer.parseInt(String.valueOf(value));
            } catch (Exception ignored) {
            }
        }
        return fallback;
    }

    private List<Integer> extractIntegerList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<Integer> result = new ArrayList<>();
        for (Object item : list) {
            int number = numberValue(item, -1);
            if (number > 0) {
                result.add(number);
            }
        }
        return result;
    }

    private List<String> extractStringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (Object item : list) {
            if (item != null && !String.valueOf(item).isBlank()) {
                result.add(String.valueOf(item).trim());
            }
        }
        return result;
    }

    private Map<String, Object> buildProgress(int current, int total, String message) {
        Map<String, Object> progress = new LinkedHashMap<>();
        progress.put("current", Math.max(0, current));
        progress.put("total", Math.max(1, total));
        progress.put("percent", Math.max(0, Math.min(100, Math.round(current * 100.0f / Math.max(1, total)))));
        progress.put("message", message);
        return progress;
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(SHANGHAI_OFFSET);
    }

    private static final class WorkflowThreadFactory implements ThreadFactory {
        private final AtomicInteger index = new AtomicInteger(1);

        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable);
            thread.setName("novel-workflow-" + index.getAndIncrement());
            thread.setDaemon(true);
            return thread;
        }
    }
}
