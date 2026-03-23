package com.novelai.backend.controller;

import com.novelai.backend.model.GenerateWorkflowRequest;
import com.novelai.backend.model.WorkflowDto;
import com.novelai.backend.model.WorkflowListResponse;
import com.novelai.backend.model.WorkflowResponse;
import com.novelai.backend.service.WorkflowReadService;
import com.novelai.backend.service.WorkflowService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class WorkflowController {

    private final WorkflowReadService workflowReadService;
    private final WorkflowService workflowService;

    public WorkflowController(WorkflowReadService workflowReadService, WorkflowService workflowService) {
        this.workflowReadService = workflowReadService;
        this.workflowService = workflowService;
    }

    @GetMapping("/workflows")
    public WorkflowListResponse workflows(@RequestParam(required = false) String bookKey) {
        return WorkflowListResponse.success(workflowReadService.list(bookKey));
    }

    @GetMapping("/workflows/{id}")
    public WorkflowResponse workflow(@PathVariable String id) {
        WorkflowDto workflow = workflowReadService.get(id);
        if (workflow == null) {
            return WorkflowResponse.failure("工作流不存在");
        }

        return WorkflowResponse.success(workflow);
    }

    @PostMapping({"/workflows/generate-next-chapter", "/generate-next-chapter", "/generate-chapter"})
    public WorkflowResponse generateNextChapter(@RequestBody(required = false) GenerateWorkflowRequest request) {
        return workflowResponse(workflowService.generateNextChapter(request));
    }

    @PostMapping({"/workflows/generate-chapters", "/generate-chapters"})
    public WorkflowResponse generateChapters(@RequestBody(required = false) GenerateWorkflowRequest request) {
        return workflowResponse(workflowService.generateChapters(request));
    }

    private WorkflowResponse workflowResponse(WorkflowDto workflow) {
        if (workflow == null) {
            return WorkflowResponse.failure("未能创建工作流");
        }

        WorkflowResponse response = WorkflowResponse.success(workflow);
        response.setMessage("工作流已创建");
        return response;
    }
}
