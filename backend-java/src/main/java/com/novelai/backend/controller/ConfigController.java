package com.novelai.backend.controller;

import com.novelai.backend.model.ApiConfigSaveRequest;
import com.novelai.backend.model.ConnectionTestRequest;
import com.novelai.backend.model.GenericResponse;
import com.novelai.backend.model.SettingsData;
import com.novelai.backend.service.AiConnectionService;
import com.novelai.backend.service.SettingsService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ConfigController {

    private final SettingsService settingsService;
    private final AiConnectionService aiConnectionService;

    public ConfigController(SettingsService settingsService, AiConnectionService aiConnectionService) {
        this.settingsService = settingsService;
        this.aiConnectionService = aiConnectionService;
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
}
