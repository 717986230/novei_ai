package com.novelai.backend.model;

import java.util.ArrayList;
import java.util.List;

public class BooksResponse {

    private List<BookDto> books = new ArrayList<>();
    private String currentBookKey;

    public List<BookDto> getBooks() {
        return books;
    }

    public void setBooks(List<BookDto> books) {
        this.books = books;
    }

    public String getCurrentBookKey() {
        return currentBookKey;
    }

    public void setCurrentBookKey(String currentBookKey) {
        this.currentBookKey = currentBookKey;
    }
}
