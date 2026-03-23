package com.novelai.backend.model;

public class BookDto {

    private String key;
    private String title;
    private String type;
    private String description;
    private String createdAt;
    private int chapterCount;
    private int lastChapterNumber;
    private boolean current;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(String createdAt) {
        this.createdAt = createdAt;
    }

    public int getChapterCount() {
        return chapterCount;
    }

    public void setChapterCount(int chapterCount) {
        this.chapterCount = chapterCount;
    }

    public int getLastChapterNumber() {
        return lastChapterNumber;
    }

    public void setLastChapterNumber(int lastChapterNumber) {
        this.lastChapterNumber = lastChapterNumber;
    }

    public boolean isCurrent() {
        return current;
    }

    public void setCurrent(boolean current) {
        this.current = current;
    }
}
