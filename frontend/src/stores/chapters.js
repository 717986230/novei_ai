import { defineStore } from 'pinia';
import { request } from '../api/http';

export const useChaptersStore = defineStore('chapters', {
  state: () => ({
    loading: false,
    chapters: [],
    activeChapterNumber: null,
    activeChapter: null
  }),
  actions: {
    loadActiveChapterFromStorage(bookKey) {
      if (!bookKey) {
        this.activeChapterNumber = null;
        return;
      }

      const stored = localStorage.getItem(`novel_ai_selected_chapter_${bookKey}`);
      this.activeChapterNumber = stored ? Number(stored) : null;
    },
    persistActiveChapter(bookKey) {
      if (!bookKey) {
        return;
      }

      if (this.activeChapterNumber) {
        localStorage.setItem(`novel_ai_selected_chapter_${bookKey}`, String(this.activeChapterNumber));
      } else {
        localStorage.removeItem(`novel_ai_selected_chapter_${bookKey}`);
      }
    },
    async fetchChapters(bookKey = '') {
      this.loading = true;
      try {
        this.chapters = await request('get', '/chapters', null, {
          params: bookKey ? { bookKey } : {}
        });
        return this.chapters;
      } finally {
        this.loading = false;
      }
    },
    async fetchChapter(number, bookKey = '') {
      const data = await request('get', `/chapters/${number}`, null, {
        params: bookKey ? { bookKey } : {}
      });
      this.activeChapter = data.chapter;
      this.activeChapterNumber = number;
      return data.chapter;
    },
    async saveChapter(number, payload, bookKey = '') {
      return request('put', `/chapters/${number}`, payload, {
        params: bookKey ? { bookKey } : {}
      });
    },
    async deleteChapter(number, bookKey = '') {
      return request('delete', `/chapters/${number}`, null, {
        params: bookKey ? { bookKey } : {}
      });
    },
    async resetBook(bookKey = '') {
      return request('post', '/reset-book', bookKey ? { bookKey } : {});
    },
    async repairData(bookKey = '') {
      return request('post', '/repair-data', bookKey ? { bookKey } : {});
    },
    async publishChapters(bookKey = '') {
      return request('post', '/publish', bookKey ? { bookKey } : {});
    }
  }
});
