package com.novelai.backend.controller;

import com.novelai.backend.model.WorkflowDto;
import com.novelai.backend.service.WorkflowReadService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class WorkflowController {

    private final WorkflowReadService workflowReadService;

    public WorkflowController(WorkflowReadService workflowReadService) {
        this.workflowReadService = workflowReadService;
    }

    @GetMapping("/workflows")
    public Map<String, Object> workflows(@RequestParam(required = false) String bookKey) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("workflows", workflowReadService.list(bookKey));
        return response;
    }

    @GetMapping("/workflows/{id}")
    public Map<String, Object> workflow(@PathVariable String id) {
        WorkflowDto workflow = workflowReadService.get(id);
        Map<String, Object> response = new LinkedHashMap<>();
        if (workflow == null) {
            response.put("success", false);
            response.put("error", "工作流不存在");
            return response;
        }

        response.put("success", true);
        response.put("workflow", workflow);
        return response;
    }
}
