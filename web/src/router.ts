import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './api';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/BooksView.vue') },
    { path: '/login', component: () => import('./views/LoginView.vue') },
    { path: '/books/:id', component: () => import('./views/BookView.vue'), props: true },
    { path: '/chapters/:id', component: () => import('./views/ChapterView.vue'), props: true },
    { path: '/settings', component: () => import('./views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to) => {
  if (to.path !== '/login' && !getToken()) return '/login';
});
