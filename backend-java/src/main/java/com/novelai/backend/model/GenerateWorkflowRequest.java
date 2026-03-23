package com.novelai.backend.model;

public class GenerateWorkflowRequest {

    private String bookKey;
    private Integer count;

    public String getBookKey() {
        return bookKey;
    }

    public void setBookKey(String bookKey) {
        this.bookKey = bookKey;
    }

    public Integer getCount() {
        return count;
    }

    public void setCount(Integer count) {
        this.count = count;
    }
}
