package com.novelai.backend.model;

import java.util.ArrayList;
import java.util.List;

public class WorkflowListResponse extends GenericResponse {

    private List<WorkflowDto> workflows = new ArrayList<>();

    public static WorkflowListResponse success(List<WorkflowDto> workflows) {
        WorkflowListResponse response = new WorkflowListResponse();
        response.setSuccess(true);
        response.setWorkflows(workflows);
        return response;
    }

    public List<WorkflowDto> getWorkflows() {
        return workflows;
    }

    public void setWorkflows(List<WorkflowDto> workflows) {
        this.workflows = workflows == null ? new ArrayList<>() : workflows;
    }
}
