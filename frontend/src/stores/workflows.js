import { defineStore } from 'pinia';
import { request } from '../api/http';

function storageKey(bookKey) {
  return `novel_ai_active_workflow_${bookKey}`;
}

export const useWorkflowStore = defineStore('workflows', {
  state: () => ({
    loading: false,
    activeWorkflowId: '',
    workflows: [],
    pollTimer: null
  }),
  getters: {
    activeWorkflow(state) {
      return state.workflows.find((workflow) => workflow.id === state.activeWorkflowId) || null;
    }
  },
  actions: {
    setActiveWorkflowId(bookKey, workflowId = '') {
      this.activeWorkflowId = workflowId;
      if (!bookKey) {
        return;
      }

      if (workflowId) {
        localStorage.setItem(storageKey(bookKey), workflowId);
      } else {
        localStorage.removeItem(storageKey(bookKey));
      }
    },
    loadActiveWorkflowFromStorage(bookKey) {
      if (!bookKey) {
        this.activeWorkflowId = '';
        return;
      }

      this.activeWorkflowId = localStorage.getItem(storageKey(bookKey)) || '';
    },
    async fetchWorkflows(bookKey = '') {
      this.loading = true;
      try {
        const data = await request('get', '/workflows', null, {
          params: bookKey ? { bookKey } : {}
        });
        this.workflows = data.workflows || [];
        return this.workflows;
      } finally {
        this.loading = false;
      }
    },
    async fetchWorkflow(id) {
      const data = await request('get', `/workflows/${id}`);
      return data.workflow;
    },
    async startGeneration(bookKey, count = 1) {
      const endpoint = count > 1 ? '/workflows/generate-chapters' : '/workflows/generate-next-chapter';
      const data = await request('post', endpoint, { bookKey, count });
      const workflow = data.workflow || null;
      this.setActiveWorkflowId(bookKey, workflow?.id || '');
      return workflow;
    },
    async refreshActiveWorkflow(bookKey) {
      if (!this.activeWorkflowId) {
        return null;
      }

      const workflow = await this.fetchWorkflow(this.activeWorkflowId);
      await this.fetchWorkflows(bookKey);
      return workflow;
    },
    startPolling(bookKey, onTick) {
      this.stopPolling();

      if (!this.activeWorkflowId) {
        return;
      }

      this.pollTimer = window.setInterval(async () => {
        try {
          const workflow = await this.refreshActiveWorkflow(bookKey);
          if (typeof onTick === 'function') {
            onTick(workflow);
          }

          if (workflow && ['succeeded', 'failed'].includes(workflow.status)) {
            this.stopPolling();
          }
        } catch (error) {
          if (typeof onTick === 'function') {
            onTick(null, error);
          }
        }
      }, 2500);
    },
    stopPolling() {
      if (this.pollTimer) {
        window.clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    }
  }
});
