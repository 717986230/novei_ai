package com.novelai.backend.model;

public class OperationResult {

    private final boolean success;
    private final String error;

    private OperationResult(boolean success, String error) {
        this.success = success;
        this.error = error;
    }

    public static OperationResult success() {
        return new OperationResult(true, null);
    }

    public static OperationResult failure(String error) {
        return new OperationResult(false, error);
    }

    public boolean isSuccess() {
        return success;
    }

    public String getError() {
        return error;
    }
}
