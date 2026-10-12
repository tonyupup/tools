# 图片工坊

浏览器本地运行的图片处理工具（不上传服务器）：裁剪与形状选取（比例 / 人像头像 / 圆形头像 / 半身照）、旋转翻转、调整、缩放与格式转换、撤销重做、宏（录制已有步骤）、批处理打包 zip。

- 所有处理都从原图按参数重新计算，撤销 / 重做不会反复压缩。
- 预览在参数变化 1 秒后刷新。
- 简易模式只显示常用项，打开「高级选项」显示更多参数和宏编辑。

## 开发

```bash
npm install
npm run dev      # 本地开发
npm run build    # 产物在 dist/
```

推送到 `main` 后由 `.github/workflows/pages.yml` 构建并发布到 GitHub Pages（Settings → Pages → Source 选 GitHub Actions）。
