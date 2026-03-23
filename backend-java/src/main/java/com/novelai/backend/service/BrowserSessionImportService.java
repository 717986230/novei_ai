package com.novelai.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.novelai.backend.model.BrowserSessionImportRequest;
import com.novelai.backend.model.BrowserSessionImportResponse;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@Service
public class BrowserSessionImportService {

    private final SettingsService settingsService;
    private final ObjectMapper objectMapper;

    public BrowserSessionImportService(SettingsService settingsService) {
        this.settingsService = settingsService;
        this.objectMapper = new ObjectMapper();
    }

    public BrowserSessionImportResponse importSession(BrowserSessionImportRequest request) {
        String platform = normalize(request == null ? null : request.getPlatform());
        String browser = normalize(request == null ? null : request.getBrowser());

        if (platform.isBlank()) {
            return failure("缺少平台标识");
        }

        if (browser.isBlank()) {
            browser = "chrome";
        }

        try {
            Path projectRoot = settingsService.resolveProjectRoot();
            Path scriptPath = projectRoot.resolve("scripts").resolve("import-browser-session.mjs").normalize();
            if (!Files.exists(scriptPath)) {
                return failure("导入脚本不存在: " + scriptPath);
            }

            List<String> command = new ArrayList<>();
            command.add("node");
            command.add(scriptPath.toString());
            command.add(platform);
            command.add(browser);

            ProcessBuilder builder = new ProcessBuilder(command);
            builder.directory(projectRoot.toFile());
            builder.environment().put("NODE_NO_WARNINGS", "1");

            Process process = builder.start();
            String output;
            String errorOutput;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                output = reader.lines().reduce("", (left, right) -> left + right);
            }
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                errorOutput = reader.lines().reduce("", (left, right) -> left + right);
            }

            int exitCode = process.waitFor();
            if (output == null || output.isBlank()) {
                if (exitCode == 0) {
                    return failure("浏览器导入没有返回结果");
                }
                return failure(errorOutput == null || errorOutput.isBlank()
                    ? "浏览器导入执行失败，退出码: " + exitCode
                    : errorOutput);
            }

            JsonNode root = objectMapper.readTree(output);
            BrowserSessionImportResponse response = new BrowserSessionImportResponse();
            response.setSuccess(root.path("success").asBoolean(false));
            response.setPlatform(root.path("platform").asText(platform));
            response.setBrowser(root.path("browser").asText(browser));
            response.setCookies(root.path("cookies").asText(""));
            response.setCookieCount(root.path("cookieCount").isMissingNode() ? null : root.path("cookieCount").asInt());
            response.setSourceUrl(root.path("sourceUrl").asText(""));

            if (response.isSuccess()) {
                response.setMessage(root.path("message").asText("已从浏览器导入登录信息"));
                return response;
            }

            response.setError(root.path("error").asText("浏览器导入失败"));
            return response;
        } catch (Exception error) {
            return failure(error.getMessage() == null ? "浏览器导入失败" : error.getMessage());
        }
    }

    private BrowserSessionImportResponse failure(String error) {
        BrowserSessionImportResponse response = new BrowserSessionImportResponse();
        response.setSuccess(false);
        response.setError(error);
        return response;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
