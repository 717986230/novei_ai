package com.novelai.backend.model;

import java.util.ArrayList;
import java.util.List;

public class PublishRequest {

    private String bookKey;
    private List<Integer> chapterNumbers = new ArrayList<>();
    private List<String> platforms = new ArrayList<>();
    private Boolean publishAll = Boolean.TRUE;

    public String getBookKey() {
        return bookKey;
    }

    public void setBookKey(String bookKey) {
        this.bookKey = bookKey;
    }

    public List<Integer> getChapterNumbers() {
        return chapterNumbers;
    }

    public void setChapterNumbers(List<Integer> chapterNumbers) {
        this.chapterNumbers = chapterNumbers;
    }

    public List<String> getPlatforms() {
        return platforms;
    }

    public void setPlatforms(List<String> platforms) {
        this.platforms = platforms;
    }

    public Boolean getPublishAll() {
        return publishAll;
    }

    public void setPublishAll(Boolean publishAll) {
        this.publishAll = publishAll;
    }
}
