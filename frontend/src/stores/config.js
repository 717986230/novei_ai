import { defineStore } from 'pinia';
import { request } from '../api/http';

export const useConfigStore = defineStore('config', {
  state: () => ({
    loading: false,
    saving: false,
    testing: false,
    data: null,
    health: null
  }),
  getters: {
    aiConfig(state) {
      return state.data?.ai || {};
    },
    mysqlConfig(state) {
      return state.data?.mysql || {};
    }
  },
  actions: {
    async fetchConfig() {
      this.loading = true;
      try {
        this.data = await request('get', '/config');
        return this.data;
      } finally {
        this.loading = false;
      }
    },
    async fetchHealth() {
      this.health = await request('get', '/health');
      return this.health;
    },
    async saveConfig(payload) {
      this.saving = true;
      try {
        return await request('post', '/save-config', payload);
      } finally {
        this.saving = false;
      }
    },
    async testConnection(payload) {
      this.testing = true;
      try {
        return await request('post', '/test-connection', payload);
      } finally {
        this.testing = false;
      }
    }
  }
});
