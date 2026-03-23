package com.novelai.backend.service;

import com.novelai.backend.model.BrowserSessionImportRequest;
import com.novelai.backend.model.BrowserSessionImportResponse;
import com.novelai.backend.model.OfficialAuthStartResponse;
import com.novelai.backend.model.OfficialAuthStatusResponse;
import com.novelai.backend.model.SettingsData;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class OfficialAuthSessionService {

    private static final int MAX_ATTEMPTS = 20;
    private static final long RETRY_DELAY_MS = 3000L;
    private static final String STATUS_PENDING = "pending";
    private static final String STATUS_SUCCESS = "success";
    private static final String STATUS_FAILED = "failed";
    private static final String BROWSER_LOCKED_ERROR = "无法占用当前浏览器配置文件";

    private final BrowserSessionImportService browserSessionImportService;
    private final SettingsService settingsService;
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final Map<String, OfficialAuthStatusResponse> taskStates = new ConcurrentHashMap<>();

    public OfficialAuthSessionService(
        BrowserSessionImportService browserSessionImportService,
        SettingsService settingsService
    ) {
        this.browserSessionImportService = browserSessionImportService;
        this.settingsService = settingsService;
    }

    public OfficialAuthStartResponse start(BrowserSessionImportRequest request) {
        String platform = normalize(request == null ? null : request.getPlatform());
        String browser = normalize(request == null ? null : request.getBrowser());

        OfficialAuthStartResponse response = new OfficialAuthStartResponse();
        if (platform.isBlank()) {
            response.setSuccess(false);
            response.setError("缺少平台标识");
            return response;
        }

        if (browser.isBlank()) {
            browser = "chrome";
        }

        String taskId = UUID.randomUUID().toString();
        OfficialAuthStatusResponse initialState = new OfficialAuthStatusResponse();
        initialState.setTaskId(taskId);
        initialState.setStatus(STATUS_PENDING);
        initialState.setSuccess(false);
        initialState.setPlatform(platform);
        initialState.setBrowser(browser);
        initialState.setMessage("已启动官网授权监听，等待浏览器登录完成");
        taskStates.put(taskId, initialState);

        String finalBrowser = browser;
        executorService.submit(() -> runTask(taskId, platform, finalBrowser));

        response.setSuccess(true);
        response.setTaskId(taskId);
        response.setPlatform(platform);
        response.setBrowser(browser);
        response.setMessage("官网授权监听已启动");
        return response;
    }

    public OfficialAuthStatusResponse getStatus(String taskId) {
        OfficialAuthStatusResponse state = taskStates.get(taskId);
        if (state != null) {
            return state;
        }

        OfficialAuthStatusResponse response = new OfficialAuthStatusResponse();
        response.setTaskId(taskId);
        response.setStatus(STATUS_FAILED);
        response.setSuccess(false);
        response.setError("授权任务不存在或已过期");
        return response;
    }

    private void runTask(String taskId, String platform, String browser) {
        try {
            for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                BrowserSessionImportRequest request = new BrowserSessionImportRequest();
                request.setPlatform(platform);
                request.setBrowser(browser);

                BrowserSessionImportResponse result = browserSessionImportService.importSession(request);
                if (result.isSuccess() && result.getCookies() != null && !result.getCookies().isBlank()) {
                    persistImportedSession(platform, result.getCookies());
                    OfficialAuthStatusResponse successState = copyResult(taskId, STATUS_SUCCESS, result);
                    successState.setMessage("官网登录态已导入并写入配置");
                    taskStates.put(taskId, successState);
                    return;
                }

                String error = normalize(result.getError());
                if (error.contains(BROWSER_LOCKED_ERROR)) {
                    OfficialAuthStatusResponse pendingState = copyResult(taskId, STATUS_PENDING, result);
                    pendingState.setMessage("已检测到浏览器仍在占用，等待关闭后自动导入");
                    taskStates.put(taskId, pendingState);
                    sleepQuietly(RETRY_DELAY_MS);
                    continue;
                }

                OfficialAuthStatusResponse failedState = copyResult(taskId, STATUS_FAILED, result);
                if (normalize(failedState.getError()).isBlank()) {
                    failedState.setError("未检测到可导入的登录态");
                }
                taskStates.put(taskId, failedState);
                return;
            }

            OfficialAuthStatusResponse timeoutState = new OfficialAuthStatusResponse();
            timeoutState.setTaskId(taskId);
            timeoutState.setStatus(STATUS_FAILED);
            timeoutState.setSuccess(false);
            timeoutState.setPlatform(platform);
            timeoutState.setBrowser(browser);
            timeoutState.setError("等待超时。请确认已完成官网登录，并在登录后关闭 Chrome 或 Edge。");
            taskStates.put(taskId, timeoutState);
        } catch (Exception error) {
            OfficialAuthStatusResponse failedState = new OfficialAuthStatusResponse();
            failedState.setTaskId(taskId);
            failedState.setStatus(STATUS_FAILED);
            failedState.setSuccess(false);
            failedState.setPlatform(platform);
            failedState.setBrowser(browser);
            failedState.setError(error.getMessage() == null ? "官网授权导入失败" : error.getMessage());
            taskStates.put(taskId, failedState);
        }
    }

    private void persistImportedSession(String platform, String cookies) {
        settingsService.updateSettings(data -> {
            Map<String, SettingsData.PlatformSettings> platforms = data.getPlatforms();
            SettingsData.PlatformSettings settings = platforms.getOrDefault(platform, new SettingsData.PlatformSettings());
            settings.setEnabled(true);
            settings.setLoginMode("cookies");
            settings.setCookies(cookies);
            settings.setHasCookies(true);
            platforms.put(platform, settings);
            data.setPlatforms(platforms);
        });
    }

    private OfficialAuthStatusResponse copyResult(String taskId, String status, BrowserSessionImportResponse result) {
        OfficialAuthStatusResponse state = new OfficialAuthStatusResponse();
        state.setTaskId(taskId);
        state.setStatus(status);
        state.setSuccess(result.isSuccess());
        state.setMessage(result.getMessage());
        state.setError(result.getError());
        state.setPlatform(result.getPlatform());
        state.setBrowser(result.getBrowser());
        state.setCookies(result.getCookies());
        state.setCookieCount(result.getCookieCount());
        state.setSourceUrl(result.getSourceUrl());
        return state;
    }

    private void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
