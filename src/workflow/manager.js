const crypto = require('crypto');

class WorkflowManager {
  constructor() {
    this.workflows = new Map();
    this.activeLocks = new Map();
    this.maxHistory = 100;
    this.store = null;
    this.initialized = false;
  }

  async initialize(store) {
    if (this.initialized && this.store === store) {
      return;
    }

    this.store = store || null;
    this.initialized = true;

    if (!this.store) {
      return;
    }

    await this.store.init();
    await this.store.markIncompleteWorkflowsFailed('服务重启，中断了之前的任务');

    const persisted = await this.store.listWorkflows({ limit: this.maxHistory });
    this.workflows.clear();
    this.activeLocks.clear();

    for (const workflow of persisted) {
      this.workflows.set(workflow.id, workflow);
      if (['pending', 'running'].includes(workflow.status)) {
        this.activeLocks.set(this.getLockKey(workflow.type, workflow.bookKey), workflow.id);
      }
    }
  }

  getLockKey(type, bookKey = '') {
    return `${type}:${bookKey || 'default'}`;
  }

  async list(filters = {}) {
    if (this.store) {
      const persisted = await this.store.listWorkflows({
        bookKey: filters.bookKey || '',
        type: filters.type || '',
        limit: filters.limit || this.maxHistory
      });

      for (const workflow of persisted) {
        this.workflows.set(workflow.id, workflow);
      }

      this.trimHistory();
      return persisted.map((workflow) => this.serialize(workflow));
    }

    const items = Array.from(this.workflows.values())
      .filter((workflow) => {
        if (filters.bookKey && workflow.bookKey !== filters.bookKey) {
          return false;
        }

        if (filters.type && workflow.type !== filters.type) {
          return false;
        }

        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return items.map((workflow) => this.serialize(workflow));
  }

  async get(id) {
    if (this.store) {
      const persisted = await this.store.getWorkflow(id);
      if (persisted) {
        this.workflows.set(id, persisted);
        return this.serialize(persisted);
      }
    }

    const workflow = this.workflows.get(id);
    return workflow ? this.serialize(workflow) : null;
  }

  async create({
    type,
    bookKey = '',
    payload = {},
    title = '',
    run
  }) {
    if (typeof run !== 'function') {
      throw new Error('Workflow handler is required');
    }

    const lockKey = this.getLockKey(type, bookKey);
    const existingId = this.activeLocks.get(lockKey);
    if (existingId) {
      const existing = await this.get(existingId);
      if (existing && ['pending', 'running'].includes(existing.status)) {
        return existing;
      }
    }

    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const workflow = {
      id,
      type,
      title: title || type,
      bookKey,
      payload,
      status: 'pending',
      progress: {
        current: 0,
        total: payload.count || 1,
        percent: 0,
        message: '任务已创建，等待执行'
      },
      result: null,
      error: '',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null
    };

    this.workflows.set(id, workflow);
    this.activeLocks.set(lockKey, id);
    await this.persist(workflow);
    this.trimHistory();

    queueMicrotask(async () => {
      await this.execute(id, lockKey, run);
    });

    return this.serialize(workflow);
  }

  async execute(id, lockKey, run) {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      return;
    }

    workflow.status = 'running';
    workflow.startedAt = new Date().toISOString();
    workflow.progress.message = '任务开始执行';
    await this.persist(workflow);

    try {
      const result = await run({
        workflow: this.serialize(workflow),
        update: async (patch = {}) => {
          await this.update(id, patch);
        }
      });

      await this.update(id, {
        status: 'succeeded',
        finishedAt: new Date().toISOString(),
        progress: {
          current: workflow.progress.total || 1,
          total: workflow.progress.total || 1,
          percent: 100,
          message: '任务执行完成'
        },
        result: result || null,
        error: ''
      });
    } catch (error) {
      await this.update(id, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        error: error.message || '任务执行失败',
        progress: {
          ...workflow.progress,
          message: error.message || '任务执行失败'
        }
      });
    } finally {
      if (this.activeLocks.get(lockKey) === workflow.id) {
        this.activeLocks.delete(lockKey);
      }
    }
  }

  async update(id, patch = {}) {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      return null;
    }

    if (patch.progress) {
      const total = patch.progress.total ?? workflow.progress.total ?? 1;
      const current = patch.progress.current ?? workflow.progress.current ?? 0;
      workflow.progress = {
        ...workflow.progress,
        ...patch.progress,
        total,
        current,
        percent: total > 0
          ? Math.max(0, Math.min(100, Math.round((current / total) * 100)))
          : 0
      };
    }

    Object.assign(workflow, {
      ...patch,
      progress: workflow.progress
    });

    await this.persist(workflow);
    return this.serialize(workflow);
  }

  async persist(workflow) {
    if (!this.store) {
      return;
    }

    await this.store.saveWorkflow(workflow);
  }

  trimHistory() {
    const items = Array.from(this.workflows.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (items.length <= this.maxHistory) {
      return;
    }

    for (const workflow of items.slice(this.maxHistory)) {
      this.workflows.delete(workflow.id);
    }
  }

  serialize(workflow) {
    return JSON.parse(JSON.stringify(workflow));
  }
}

module.exports = new WorkflowManager();
module.exports.WorkflowManager = WorkflowManager;
