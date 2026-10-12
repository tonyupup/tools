import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base './' 让产物在 https://用户名.github.io/仓库名/ 这类子路径下也能正常加载
export default defineConfig({ base: './', plugins: [preact()] });
