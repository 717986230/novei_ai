package com.novelai.backend.controller;

import com.novelai.backend.model.BookDto;
import com.novelai.backend.model.BookMutationResponse;
import com.novelai.backend.model.BookUpsertRequest;
import com.novelai.backend.model.BooksResponse;
import com.novelai.backend.model.GenericResponse;
import com.novelai.backend.model.OperationResult;
import com.novelai.backend.model.SelectBookRequest;
import com.novelai.backend.service.BookWorkspaceService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class BookController {

    private final BookWorkspaceService bookWorkspaceService;

    public BookController(BookWorkspaceService bookWorkspaceService) {
        this.bookWorkspaceService = bookWorkspaceService;
    }

    @GetMapping("/books")
    public BooksResponse books() {
        return bookWorkspaceService.listBooks();
    }

    @PostMapping("/books")
    public BookMutationResponse createBook(@RequestBody BookUpsertRequest request) {
        BookMutationResponse response = new BookMutationResponse();
        try {
            BookDto book = bookWorkspaceService.createBook(request);
            response.setSuccess(true);
            response.setTitle(book.getTitle());
            response.setBook(book);
            response.setMessage("书籍创建成功");
        } catch (Exception error) {
            response.setSuccess(false);
            response.setError(error.getMessage());
        }
        return response;
    }

    @PostMapping("/books/select")
    public GenericResponse selectBook(@RequestBody SelectBookRequest request) {
        OperationResult result = bookWorkspaceService.selectBook(request == null ? null : request.getBookKey());
        return result.isSuccess() ? GenericResponse.success("切换成功") : GenericResponse.failure(result.getError());
    }

    @DeleteMapping("/books/{bookKey}")
    public GenericResponse deleteBook(@PathVariable String bookKey) {
        try {
            OperationResult result = bookWorkspaceService.deleteBook(bookKey);
            return result.isSuccess() ? GenericResponse.success("删除成功") : GenericResponse.failure(result.getError());
        } catch (Exception error) {
            return GenericResponse.failure(error.getMessage());
        }
    }
}
