import axios from 'axios';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: Number(import.meta.env.VITE_API_TIMEOUT || 30000)
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      '请求失败';
    return Promise.reject(new Error(message));
  }
);

export async function request(method, url, data = null, config = {}) {
  const response = await http.request({
    method,
    url,
    data,
    ...config
  });

  return response.data;
}

export default http;
