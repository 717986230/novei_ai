package com.novelai.backend.controller;

import com.novelai.backend.model.ApiConfigSaveRequest;
import com.novelai.backend.model.BrowserSessionImportRequest;
import com.novelai.backend.model.BrowserSessionImportResponse;
import com.novelai.backend.model.ConnectionTestRequest;
import com.novelai.backend.model.GenericResponse;
import com.novelai.backend.model.OfficialAuthStartResponse;
import com.novelai.backend.model.OfficialAuthStatusResponse;
import com.novelai.backend.model.SettingsData;
import com.novelai.backend.service.AiConnectionService;
import com.novelai.backend.service.BrowserSessionImportService;
import com.novelai.backend.service.OfficialAuthSessionService;
import com.novelai.backend.service.SettingsService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ConfigController {

    private final SettingsService settingsService;
    private final AiConnectionService aiConnectionService;
    private final BrowserSessionImportService browserSessionImportService;
    private final OfficialAuthSessionService officialAuthSessionService;

    public ConfigController(
        SettingsService settingsService,
        AiConnectionService aiConnectionService,
        BrowserSessionImportService browserSessionImportService,
        OfficialAuthSessionService officialAuthSessionService
    ) {
        this.settingsService = settingsService;
        this.aiConnectionService = aiConnectionService;
        this.browserSessionImportService = browserSessionImportService;
        this.officialAuthSessionService = officialAuthSessionService;
    }

    @GetMapping("/config")
    public SettingsData config() {
        return settingsService.readMaskedSettings();
    }

    @PostMapping("/save-config")
    public GenericResponse saveConfig(@Valid @RequestBody ApiConfigSaveRequest request) {
        settingsService.saveApiConfig(request);
        return GenericResponse.success("配置已保存");
    }

    @PostMapping("/test-connection")
    public GenericResponse testConnection(@RequestBody ConnectionTestRequest request) {
        return aiConnectionService.testConnection(request);
    }

    @PostMapping("/platforms/import-browser-session")
    public BrowserSessionImportResponse importBrowserSession(@RequestBody BrowserSessionImportRequest request) {
        return browserSessionImportService.importSession(request);
    }

    @PostMapping("/platforms/official-auth/start")
    public OfficialAuthStartResponse startOfficialAuth(@RequestBody BrowserSessionImportRequest request) {
        return officialAuthSessionService.start(request);
    }

    @GetMapping("/platforms/official-auth/status")
    public OfficialAuthStatusResponse officialAuthStatus(@RequestParam("taskId") String taskId) {
        return officialAuthSessionService.getStatus(taskId);
    }
}
