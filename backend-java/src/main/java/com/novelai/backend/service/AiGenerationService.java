package com.novelai.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.novelai.backend.model.NovelInfoDto;
import com.novelai.backend.model.SettingsData;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class AiGenerationService {

    private static final String DEFAULT_MODEL = "minimaxai/minimax-m2.5";

    private final SettingsService settingsService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AiGenerationService(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    public String generateBookTitle(NovelInfoDto novelInfo) {
        List<String> prompt = new ArrayList<>();
        prompt.add("你是一名资深中文网文编辑。");
        prompt.add("请根据下面的小说类型和简介，生成一个适合中文小说平台发布的书名。");
        prompt.add("");
        prompt.add("小说类型：" + safeValue(novelInfo == null ? null : novelInfo.getType(), "未提供"));
        prompt.add("小说简介：" + safeValue(novelInfo == null ? null : novelInfo.getDescription(), "未提供"));
        prompt.add("");
        prompt.add("要求：");
        prompt.add("1. 只输出一个最终书名。");
        prompt.add("2. 不要解释，不要输出思考过程。");
        prompt.add("3. 书名控制在 4 到 14 个汉字之间。");

        return cleanTitle(callChatCompletion(String.join("\n", prompt), 120, 0.7, 30000, 0), novelInfo, 1);
    }

    public Map<String, Object> generateOutline(NovelInfoDto novelInfo, int targetChapters) {
        List<String> prompt = new ArrayList<>();
        prompt.add("你是一名专业小说策划。");
        prompt.add("请根据下面的信息生成小说大纲，并严格输出 JSON。");
        prompt.add("");
        prompt.add("小说标题：" + safeValue(novelInfo == null ? null : novelInfo.getTitle(), "未命名"));
        prompt.add("小说类型：" + safeValue(novelInfo == null ? null : novelInfo.getType(), "未提供"));
        prompt.add("小说简介：" + safeValue(novelInfo == null ? null : novelInfo.getDescription(), "未提供"));
        prompt.add("计划章节数：" + targetChapters);
        prompt.add("");
        prompt.add("JSON 示例：");
        prompt.add("{\"世界观\":\"...\",\"角色\":[\"...\"],\"主线\":\"...\",\"章节规划\":[{\"chapter\":1,\"summary\":\"...\"}]}");

        return parseJson(callChatCompletion(String.join("\n", prompt), 2200, 0.7, 45000, 0));
    }

    public String generateChapterTitle(NovelInfoDto novelInfo, int chapterNumber, String outlineText) {
        List<String> prompt = new ArrayList<>();
        prompt.add("你是一名专业中文网络小说作者。");
        prompt.add("请为下面这本小说生成第 " + chapterNumber + " 章的章节标题。");
        prompt.add("");
        prompt.add("小说标题：" + safeValue(novelInfo == null ? null : novelInfo.getTitle(), "未命名"));
        prompt.add("小说类型：" + safeValue(novelInfo == null ? null : novelInfo.getType(), "未提供"));
        prompt.add("小说简介：" + safeValue(novelInfo == null ? null : novelInfo.getDescription(), "未提供"));
        if (outlineText != null && !outlineText.isBlank()) {
            prompt.add("大纲参考：");
            prompt.add(outlineText.trim());
        }
        prompt.add("");
        prompt.add("要求：");
        prompt.add("1. 只输出标题。");
        prompt.add("2. 不要解释，不要输出思考过程。");
        prompt.add("3. 标题长度控制在 4 到 12 个汉字之间。");

        return cleanTitle(callChatCompletion(String.join("\n", prompt), 80, 0.7, 30000, 0), novelInfo, chapterNumber);
    }

    public String generateChapterContent(
        NovelInfoDto novelInfo,
        int chapterNumber,
        String chapterTitle,
        String previousContent,
        String outlineText
    ) {
        int targetWords = clampWordsPerChapter(novelInfo == null ? null : novelInfo.getWordsPerChapter());
        int maxTokens = resolveContentMaxTokens(targetWords);
        int timeoutMs = resolveContentTimeout(targetWords);

        List<String> prompt = new ArrayList<>();
        prompt.add("你是一名专业中文网络小说作者。");
        prompt.add("请创作下面这本小说的正文内容。");
        prompt.add("");
        prompt.add("小说标题：" + safeValue(novelInfo == null ? null : novelInfo.getTitle(), "未命名"));
        prompt.add("小说类型：" + safeValue(novelInfo == null ? null : novelInfo.getType(), "未提供"));
        prompt.add("小说简介：" + safeValue(novelInfo == null ? null : novelInfo.getDescription(), "未提供"));
        prompt.add("章节号：第 " + chapterNumber + " 章");
        prompt.add("章节标题：" + safeValue(chapterTitle, "第 " + chapterNumber + " 章"));
        prompt.add("目标字数：" + targetWords + " 字");

        if (outlineText != null && !outlineText.isBlank()) {
            prompt.add("");
            prompt.add("大纲参考：");
            prompt.add(outlineText.trim());
        }

        if (previousContent != null && !previousContent.isBlank()) {
            prompt.add("");
            prompt.add("上一章结尾参考：");
            prompt.add(extractPreviousExcerpt(previousContent));
        }

        prompt.add("");
        prompt.add("写作要求：");
        prompt.add("1. 情节要承接上一章，人物行为连续。");
        prompt.add("2. 要有场景、动作、对白和推进，避免空泛总结。");
        prompt.add("3. 直接输出正文，不要再输出章节标题。");
        prompt.add("4. 不要解释，不要输出思考过程，不要写“以下是正文”。");
        prompt.add("5. 字数尽量接近目标字数，允许上下浮动 10%。");

        String content = cleanContent(callChatCompletion(String.join("\n", prompt), maxTokens, 0.8, timeoutMs, 0));
        if (content.isBlank()) {
            throw new IllegalStateException("AI 未返回有效章节正文");
        }
        return content;
    }

    private String callChatCompletion(String prompt, int maxTokens, double temperature, int timeoutOverrideMs, int retryOverride) {
        SettingsData settings = settingsService.readSettings();
        SettingsData.AiSettings ai = settings.getAi();
        if (ai == null) {
            throw new IllegalStateException("未找到 AI 配置");
        }

        String apiUrl = resolveApiUrl(ai.getApiUrl(), ai.getBaseUrl());
        String apiKey = ai.getApiKey();
        if (apiUrl.isBlank() || apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("请先配置 AI 的 API URL 和 API Key");
        }

        int configuredTimeout = ai.getTimeoutMs() != null && ai.getTimeoutMs() > 0 ? ai.getTimeoutMs() : 90000;
        int timeoutMs = timeoutOverrideMs > 0 ? Math.min(configuredTimeout, timeoutOverrideMs) : configuredTimeout;
        int configuredRetry = ai.getRetryCount() != null && ai.getRetryCount() >= 0 ? ai.getRetryCount() : 0;
        int retryCount = Math.max(0, retryOverride >= 0 ? retryOverride : configuredRetry);
        String model = ai.getModel() == null || ai.getModel().isBlank() ? DEFAULT_MODEL : ai.getModel().trim();

        RuntimeException lastError = null;
        for (int attempt = 0; attempt <= retryCount; attempt += 1) {
            try {
                HttpClient.Builder builder = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(timeoutMs));

                if (ai.getProxyUrl() != null && !ai.getProxyUrl().isBlank()) {
                    URI proxyUri = URI.create(ai.getProxyUrl().trim());
                    builder.proxy(ProxySelector.of(new InetSocketAddress(proxyUri.getHost(), proxyUri.getPort())));
                }

                HttpClient client = builder.build();
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("model", model);
                payload.put("messages", List.of(Map.of("role", "user", "content", prompt)));
                payload.put("max_tokens", maxTokens);
                payload.put("temperature", temperature);

                HttpRequest request = HttpRequest.newBuilder(URI.create(apiUrl))
                    .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                    .header("Authorization", "Bearer " + apiKey)
                    .timeout(Duration.ofMillis(timeoutMs))
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                    .build();

                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    throw new IllegalStateException("AI 接口返回 HTTP " + response.statusCode() + ": " + response.body());
                }

                JsonNode root = objectMapper.readTree(response.body());
                String content = root.path("choices").path(0).path("message").path("content").asText("");
                if (content.isBlank()) {
                    throw new IllegalStateException("AI 接口没有返回可用内容");
                }

                return content;
            } catch (Exception error) {
                lastError = error instanceof RuntimeException runtimeException
                    ? runtimeException
                    : new IllegalStateException(error.getMessage(), error);

                if (attempt >= retryCount || !isRetryable(error)) {
                    throw lastError;
                }
            }
        }

        throw lastError == null ? new IllegalStateException("AI 调用失败") : lastError;
    }

    private String resolveApiUrl(String apiUrl, String baseUrl) {
        if (apiUrl != null && !apiUrl.isBlank()) {
            return apiUrl.trim();
        }
        if (baseUrl == null || baseUrl.isBlank()) {
            return "";
        }

        String normalized = baseUrl.trim();
        if (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized + "/chat/completions";
    }

    private boolean isRetryable(Exception error) {
        String message = error.getMessage() == null ? "" : error.getMessage().toLowerCase(Locale.ROOT);
        return message.contains("timeout")
            || message.contains("timed out")
            || message.contains("connection reset")
            || message.contains("broken pipe")
            || message.contains("econnreset")
            || message.contains("etimedout");
    }

    private Map<String, Object> parseJson(String raw) {
        try {
            String candidate = stripThinking(raw);
            int start = candidate.indexOf('{');
            int end = candidate.lastIndexOf('}');
            if (start >= 0 && end > start) {
                candidate = candidate.substring(start, end + 1);
            }
            return objectMapper.readValue(candidate, new TypeReference<>() {});
        } catch (Exception ignored) {
            return Collections.emptyMap();
        }
    }

    private String cleanContent(String raw) {
        return stripThinking(raw)
            .replaceAll("(?i)^正文[:：\\s]*", "")
            .trim();
    }

    private String cleanTitle(String raw, NovelInfoDto novelInfo, int chapterNumber) {
        String candidate = stripThinking(raw);
        String[] lines = candidate.split("\\R");
        for (String line : lines) {
            if (line != null && !line.isBlank()) {
                candidate = line.trim();
                break;
            }
        }

        candidate = candidate
            .replaceAll("(?i)^标题[:：\\s]*", "")
            .replaceAll("(?i)^书名[:：\\s]*", "")
            .replaceAll("^[\"'“”‘’《》【】\\[\\]()]+|[\"'“”‘’《》【】\\[\\]()]+$", "")
            .replaceAll("\\s+", "")
            .trim();

        if (candidate.isBlank() || candidate.length() > 20 || candidate.contains("<") || candidate.contains(">")) {
            return fallbackTitle(novelInfo, chapterNumber);
        }
        return candidate;
    }

    private String fallbackTitle(NovelInfoDto novelInfo, int chapterNumber) {
        String description = safeValue(novelInfo == null ? null : novelInfo.getDescription(), "");
        String compact = description.replaceAll("[，。！？；：、\\s]", "");
        if (compact.length() >= 4) {
            return compact.substring(0, Math.min(8, compact.length()));
        }

        String type = safeValue(novelInfo == null ? null : novelInfo.getType(), "");
        if (!type.isBlank()) {
            return type + "第" + chapterNumber + "章";
        }
        return "第" + chapterNumber + "章";
    }

    private String stripThinking(String text) {
        if (text == null) {
            return "";
        }
        return text
            .replaceAll("(?is)<think>.*?</think>", "")
            .replaceAll("(?is)<think>.*", "")
            .trim();
    }

    private String safeValue(Object value, Object fallback) {
        if (value == null) {
            return String.valueOf(fallback);
        }
        String text = String.valueOf(value).trim();
        return text.isBlank() ? String.valueOf(fallback) : text;
    }

    private int clampWordsPerChapter(Integer wordsPerChapter) {
        if (wordsPerChapter == null) {
            return 2000;
        }
        return Math.max(2000, Math.min(6000, wordsPerChapter));
    }

    private int resolveContentMaxTokens(int targetWords) {
        return Math.max(2600, Math.min(7200, targetWords + 1200));
    }

    private int resolveContentTimeout(int targetWords) {
        if (targetWords <= 2000) {
            return 60000;
        }
        if (targetWords <= 4000) {
            return 90000;
        }
        return 120000;
    }

    private String extractPreviousExcerpt(String previousContent) {
        String normalized = previousContent.trim();
        if (normalized.length() <= 600) {
            return normalized;
        }
        return normalized.substring(normalized.length() - 600);
    }
}
