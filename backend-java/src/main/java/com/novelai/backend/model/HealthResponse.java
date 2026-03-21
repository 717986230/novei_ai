package com.novelai.backend.model;

public class HealthResponse {

    private boolean success;
    private String serverTime;
    private boolean aiConfigured;
    private boolean mysqlEnabled;
    private boolean mysqlAvailable;

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getServerTime() {
        return serverTime;
    }

    public void setServerTime(String serverTime) {
        this.serverTime = serverTime;
    }

    public boolean isAiConfigured() {
        return aiConfigured;
    }

    public void setAiConfigured(boolean aiConfigured) {
        this.aiConfigured = aiConfigured;
    }

    public boolean isMysqlEnabled() {
        return mysqlEnabled;
    }

    public void setMysqlEnabled(boolean mysqlEnabled) {
        this.mysqlEnabled = mysqlEnabled;
    }

    public boolean isMysqlAvailable() {
        return mysqlAvailable;
    }

    public void setMysqlAvailable(boolean mysqlAvailable) {
        this.mysqlAvailable = mysqlAvailable;
    }
}
