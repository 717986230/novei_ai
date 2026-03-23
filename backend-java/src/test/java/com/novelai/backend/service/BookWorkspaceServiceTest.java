package com.novelai.backend.service;

import com.novelai.backend.model.ChapterDto;
import com.novelai.backend.model.OperationResult;
import com.novelai.backend.model.PublishResponse;
import com.novelai.backend.model.RepairDataResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BookWorkspaceServiceTest {

    @Mock
    private BookStorageService bookStorageService;

    @Mock
    private SettingsService settingsService;

    private BookWorkspaceService service;

    @BeforeEach
    void setUp() {
        service = new BookWorkspaceService(bookStorageService, settingsService);
    }

    @Test
    void selectBookFailsWhenBookDoesNotExist() {
        when(bookStorageService.bookExists("missing-book")).thenReturn(false);

        OperationResult result = service.selectBook("missing-book");

        assertFalse(result.isSuccess());
        assertEquals("书籍不存在", result.getError());
        verify(bookStorageService, never()).setCurrentBookKey("missing-book");
    }

    @Test
    void deleteBookFailsWhenBookDoesNotExist() {
        when(bookStorageService.deleteBook("missing-book")).thenReturn(false);

        OperationResult result = service.deleteBook("missing-book");

        assertFalse(result.isSuccess());
        assertEquals("书籍不存在", result.getError());
    }

    @Test
    void repairDataReturnsLegacyFields() {
        when(bookStorageService.getCurrentBookKey()).thenReturn("book-a");
        when(bookStorageService.bookExists("book-a")).thenReturn(true);
        when(bookStorageService.repairBook("book-a")).thenReturn(3);
        when(bookStorageService.getLastChapterNumber("book-a")).thenReturn(12);

        RepairDataResponse response = service.repairData(null);

        assertTrue(response.isSuccess());
        assertEquals(3, response.getRepaired());
        assertEquals(12, response.getLastChapterNumber());
    }

    @Test
    void publishReturnsLegacyFieldsForSuccess() {
        ChapterDto chapter1 = new ChapterDto();
        chapter1.setNumber(1);
        chapter1.setTitle("第一章");
        chapter1.setPublished(false);

        ChapterDto chapter2 = new ChapterDto();
        chapter2.setNumber(2);
        chapter2.setTitle("第二章");
        chapter2.setPublished(false);

        when(bookStorageService.getCurrentBookKey()).thenReturn("book-a");
        when(bookStorageService.bookExists("book-a")).thenReturn(true);
        when(bookStorageService.getChaptersByBookKey("book-a")).thenReturn(List.of(chapter1, chapter2));
        when(bookStorageService.publishBook("book-a")).thenReturn(2);

        PublishResponse response = service.publish(null);

        assertTrue(response.isSuccess());
        assertEquals(2, response.getCount());
        assertEquals(2, response.getTotal());
        assertEquals(0, response.getFailed());
        assertEquals(2, response.getResults().size());
    }

    @Test
    void publishReturnsLegacyFieldsForNoPendingChapters() {
        ChapterDto chapter = new ChapterDto();
        chapter.setNumber(1);
        chapter.setTitle("第一章");
        chapter.setPublished(true);

        when(bookStorageService.getCurrentBookKey()).thenReturn("book-a");
        when(bookStorageService.bookExists("book-a")).thenReturn(true);
        when(bookStorageService.getChaptersByBookKey("book-a")).thenReturn(List.of(chapter));

        PublishResponse response = service.publish(null);

        assertFalse(response.isSuccess());
        assertEquals(0, response.getCount());
        assertEquals(0, response.getFailed());
        assertEquals(0, response.getResults().size());
        assertEquals("没有待发布的章节", response.getError());
    }
}
