package com.novelai.backend.controller;

import com.novelai.backend.model.ChapterDto;
import com.novelai.backend.model.ChapterResponse;
import com.novelai.backend.model.ChapterUpdateRequest;
import com.novelai.backend.model.GenericResponse;
import com.novelai.backend.model.PublishRequest;
import com.novelai.backend.model.PublishResponse;
import com.novelai.backend.model.RepairDataRequest;
import com.novelai.backend.model.RepairDataResponse;
import com.novelai.backend.service.BookWorkspaceService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class ChapterController {

    private final BookWorkspaceService bookWorkspaceService;

    public ChapterController(BookWorkspaceService bookWorkspaceService) {
        this.bookWorkspaceService = bookWorkspaceService;
    }

    @GetMapping("/chapters")
    public List<ChapterDto> chapters(@RequestParam(required = false) String bookKey) {
        if (bookKey == null || bookKey.isBlank()) {
            return bookWorkspaceService.listChapters();
        }
        return bookWorkspaceService.listChapters(bookKey);
    }

    @GetMapping("/chapters/{number}")
    public ChapterResponse chapter(@PathVariable int number, @RequestParam(required = false) String bookKey) {
        ChapterResponse response = new ChapterResponse();
        try {
            ChapterDto chapter = bookKey == null || bookKey.isBlank()
                ? bookWorkspaceService.getChapter(number)
                : bookWorkspaceService.getChapter(bookKey, number);
            if (chapter == null) {
                response.setSuccess(false);
                response.setError("绔犺妭涓嶅瓨鍦?");
                return response;
            }

            response.setSuccess(true);
            response.setChapter(chapter);
            return response;
        } catch (Exception error) {
            response.setSuccess(false);
            response.setError(error.getMessage());
            return response;
        }
    }

    @PutMapping("/chapters/{number}")
    public ChapterResponse updateChapter(
        @PathVariable int number,
        @RequestBody ChapterUpdateRequest request,
        @RequestParam(required = false) String bookKey
    ) {
        ChapterResponse response = new ChapterResponse();
        try {
            ChapterDto chapter = bookKey == null || bookKey.isBlank()
                ? bookWorkspaceService.updateChapter(number, request)
                : bookWorkspaceService.updateChapter(bookKey, number, request);
            if (chapter == null) {
                response.setSuccess(false);
                response.setError("绔犺妭涓嶅瓨鍦?");
                return response;
            }

            response.setSuccess(true);
            response.setMessage("绔犺妭宸蹭繚瀛?");
            response.setChapter(chapter);
            return response;
        } catch (Exception error) {
            response.setSuccess(false);
            response.setError(error.getMessage());
            return response;
        }
    }

    @DeleteMapping("/chapters/{number}")
    public GenericResponse deleteChapter(@PathVariable int number, @RequestParam(required = false) String bookKey) {
        try {
            boolean success = bookKey == null || bookKey.isBlank()
                ? bookWorkspaceService.deleteChapter(number)
                : bookWorkspaceService.deleteChapter(bookKey, number);
            return success ? GenericResponse.success("鍒犻櫎鎴愬姛") : GenericResponse.failure("绔犺妭涓嶅瓨鍦?");
        } catch (Exception error) {
            return GenericResponse.failure(error.getMessage());
        }
    }

    @PostMapping("/repair-data")
    public RepairDataResponse repairData(@RequestBody(required = false) RepairDataRequest request) {
        return bookWorkspaceService.repairData(request == null ? null : request.getBookKey());
    }

    @PostMapping("/publish")
    public PublishResponse publish(@RequestBody(required = false) PublishRequest request) {
        return bookWorkspaceService.publish(request == null ? null : request.getBookKey());
    }
}
