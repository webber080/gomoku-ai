# gomoku-ai

五子棋人机对战（Web Worker 后台 AI + 连珠禁手规则）。线上地址：https://wuziqi.supertato.top

纯前端：index.html + style.css + renju.js（规则）+ ai.js（AI）+ game.js（UI），worker.js 后台计算。

部署到 Cloudflare Pages（项目名 `wuziqi`）：

```bash
npx wrangler pages deploy . --project-name wuziqi --branch main
```

本地跑测试：

```bash
node test_renju.js
```
