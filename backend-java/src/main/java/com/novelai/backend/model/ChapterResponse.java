package com.novelai.backend.model;

public class ChapterResponse {

    private boolean success;
    private String message;
    private String error;
    private ChapterDto chapter;

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    public ChapterDto getChapter() {
        return chapter;
    }

    public void setChapter(ChapterDto chapter) {
        this.chapter = chapter;
    }
}
