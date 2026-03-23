import { defineStore } from 'pinia';
import { request } from '../api/http';

function getStoredBookKey() {
  return localStorage.getItem('novel_ai_current_book_key') || '';
}

function setStoredBookKey(bookKey) {
  if (bookKey) {
    localStorage.setItem('novel_ai_current_book_key', bookKey);
  } else {
    localStorage.removeItem('novel_ai_current_book_key');
  }
}

export const useBooksStore = defineStore('books', {
  state: () => ({
    loading: false,
    books: [],
    currentBookKey: getStoredBookKey(),
    novelInfo: null
  }),
  getters: {
    currentBook(state) {
      return state.books.find((book) => book.key === state.currentBookKey) || null;
    }
  },
  actions: {
    loadCurrentBookFromStorage() {
      this.currentBookKey = getStoredBookKey();
      return this.currentBookKey;
    },
    persistCurrentBook(bookKey = this.currentBookKey) {
      this.currentBookKey = bookKey || '';
      setStoredBookKey(this.currentBookKey);
    },
    async fetchBooks() {
      this.loading = true;
      try {
        const data = await request('get', '/books');
        this.books = data.books || [];
        this.currentBookKey = data.currentBookKey || this.currentBookKey || '';
        this.persistCurrentBook(this.currentBookKey);
        return data;
      } finally {
        this.loading = false;
      }
    },
    async fetchNovelInfo(bookKey = this.currentBookKey) {
      this.novelInfo = await request('get', '/novel-info', null, {
        params: bookKey ? { bookKey } : {}
      });
      this.currentBookKey = this.novelInfo?.currentBookKey || this.currentBookKey;
      this.persistCurrentBook(this.currentBookKey);
      return this.novelInfo;
    },
    async selectBook(bookKey) {
      await request('post', '/books/select', { bookKey });
      this.persistCurrentBook(bookKey);
      return true;
    },
    async createBook(payload) {
      return request('post', '/books', payload);
    },
    async saveNovelInfo(payload) {
      return request('post', '/create-novel', {
        bookKey: this.currentBookKey,
        ...payload
      });
    },
    async deleteBook(bookKey) {
      return request('delete', `/books/${encodeURIComponent(bookKey)}`);
    }
  }
});
