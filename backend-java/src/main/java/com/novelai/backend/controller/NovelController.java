package com.novelai.backend.controller;

import com.novelai.backend.model.BookMutationResponse;
import com.novelai.backend.model.BookUpsertRequest;
import com.novelai.backend.model.GenericResponse;
import com.novelai.backend.model.NovelInfoDto;
import com.novelai.backend.model.SelectBookRequest;
import com.novelai.backend.service.BookWorkspaceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class NovelController {

    private final BookWorkspaceService bookWorkspaceService;

    public NovelController(BookWorkspaceService bookWorkspaceService) {
        this.bookWorkspaceService = bookWorkspaceService;
    }

    @GetMapping("/novel-info")
    public NovelInfoDto novelInfo(@RequestParam(required = false) String bookKey) {
        if (bookKey == null || bookKey.isBlank()) {
            return bookWorkspaceService.getNovelInfo();
        }
        return bookWorkspaceService.getNovelInfoByBookKey(bookKey);
    }

    @PostMapping("/create-novel")
    public BookMutationResponse createNovel(@RequestBody BookUpsertRequest request) {
        BookMutationResponse response = new BookMutationResponse();
        try {
            var book = bookWorkspaceService.saveCurrentNovel(request);
            response.setSuccess(true);
            response.setTitle(book.getTitle());
            response.setBook(book);
            response.setMessage("灏忚淇℃伅淇濆瓨鎴愬姛");
        } catch (Exception error) {
            response.setSuccess(false);
            response.setError(error.getMessage());
        }
        return response;
    }

    @PostMapping("/reset-book")
    public GenericResponse resetBook(@RequestBody(required = false) SelectBookRequest request) {
        try {
            boolean success = request == null || request.getBookKey() == null || request.getBookKey().isBlank()
                ? bookWorkspaceService.resetBook()
                : bookWorkspaceService.resetBook(request.getBookKey());
            return success ? GenericResponse.success("褰撳墠涔﹀凡閲嶇疆") : GenericResponse.failure("褰撳墠娌℃湁鍙噸缃殑涔︾睄");
        } catch (Exception error) {
            return GenericResponse.failure(error.getMessage());
        }
    }
}
