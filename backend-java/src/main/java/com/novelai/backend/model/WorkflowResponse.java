package com.novelai.backend.model;

public class WorkflowResponse extends GenericResponse {

    private WorkflowDto workflow;

    public static WorkflowResponse success(WorkflowDto workflow) {
        WorkflowResponse response = new WorkflowResponse();
        response.setSuccess(true);
        response.setWorkflow(workflow);
        return response;
    }

    public static WorkflowResponse failure(String error) {
        WorkflowResponse response = new WorkflowResponse();
        response.setSuccess(false);
        response.setError(error);
        return response;
    }

    public WorkflowDto getWorkflow() {
        return workflow;
    }

    public void setWorkflow(WorkflowDto workflow) {
        this.workflow = workflow;
    }
}
