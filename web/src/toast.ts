import { ref } from 'vue';
export const toastMsg = ref('');
let t: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  toastMsg.value = msg;
  clearTimeout(t);
  t = setTimeout(() => (toastMsg.value = ''), 2200);
}
