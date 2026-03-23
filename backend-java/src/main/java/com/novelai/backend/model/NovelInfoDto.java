package com.novelai.backend.model;

import java.util.LinkedHashMap;
import java.util.Map;

public class NovelInfoDto {

    private String title;
    private String type;
    private String description;
    private Integer targetChapters;
    private Integer wordsPerChapter;
    private String createdAt;
    private Map<String, Object> stats = new LinkedHashMap<>();
    private String currentBookKey;

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

    public Integer getTargetChapters() {
        return targetChapters;
    }

    public void setTargetChapters(Integer targetChapters) {
        this.targetChapters = targetChapters;
    }

    public Integer getWordsPerChapter() {
        return wordsPerChapter;
    }

    public void setWordsPerChapter(Integer wordsPerChapter) {
        this.wordsPerChapter = wordsPerChapter;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(String createdAt) {
        this.createdAt = createdAt;
    }

    public Map<String, Object> getStats() {
        return stats;
    }

    public void setStats(Map<String, Object> stats) {
        this.stats = stats;
    }

    public String getCurrentBookKey() {
        return currentBookKey;
    }

    public void setCurrentBookKey(String currentBookKey) {
        this.currentBookKey = currentBookKey;
    }
}
