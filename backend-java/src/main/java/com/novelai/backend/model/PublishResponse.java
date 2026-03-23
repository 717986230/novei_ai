package com.novelai.backend.model;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class PublishResponse extends GenericResponse {

    private int count;
    private int total;
    private int failed;
    private List<Map<String, Object>> results = new ArrayList<>();

    public int getCount() {
        return count;
    }

    public void setCount(int count) {
        this.count = count;
    }

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }

    public int getFailed() {
        return failed;
    }

    public void setFailed(int failed) {
        this.failed = failed;
    }

    public List<Map<String, Object>> getResults() {
        return results;
    }

    public void setResults(List<Map<String, Object>> results) {
        this.results = results == null ? new ArrayList<>() : results;
    }
}
