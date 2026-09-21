# 鞋链智排协作说明

本项目使用 GitHub 的分支和 Pull Request 协作。`main` 分支只保留已经通过检查的代码。

## 第一次参与

```bash
git clone https://github.com/zhanghaosen990-wq/shoe-chain-ai-scheduler.git
cd shoe-chain-ai-scheduler
git switch -c feature/你的功能名称
```

完成修改后运行：

```bash
node --test app/test/*.test.js
node_modules/.bin/esbuild app/portal/main.jsx --bundle --minify --outfile=app/portal/dist/main.js --loader:.css=css
```

确认通过后提交并推送：

```bash
git add .
git commit -m "feat: 描述你的修改"
git push -u origin feature/你的功能名称
```

然后在 GitHub 创建 Pull Request，目标分支选择 `main`。合并前请让另一位协作者检查页面和测试结果。

## 两人协作规则（必须遵守）

### 朋友负责：在自己的分支修改并提交 PR

朋友拥有仓库写入权限后，只在 `feature/*` 分支工作，不直接向 `main` 提交，也不自行合并 Pull Request：

```bash
git clone https://github.com/zhanghaosen990-wq/shoe-chain-ai-scheduler.git
cd shoe-chain-ai-scheduler
git switch -c feature/friend-功能名称 origin/main

# 修改后先自测
npm test
npm run build

git add .
git commit -m "feat: 描述本次修改"
git push -u origin feature/friend-功能名称
```

推送后在 GitHub 创建以 `main` 为目标的 Pull Request，填写改动内容和验证方式，等待所有者审核。不得修改或删除比赛说明 PDF、`data/demo_data.json` 等原始样本；确有需要时必须先在 PR 中说明并取得所有者同意。

### 所有者负责：下载朋友的版本、测试、批准和合并

所有者收到 Pull Request 后，先等待 GitHub Actions 的 `Check / test` 通过，再在本地取出该 PR 测试（把 `<PR编号>` 替换成页面上的数字）：

```bash
git fetch origin pull/<PR编号>/head:review/pr-<PR编号>
git switch review/pr-<PR编号>
npm ci
npm test
npm run build
```

随后在浏览器检查相关页面和核心流程。只有测试结果和页面检查都通过时，才由 `@zhanghaosen990-wq` 在 GitHub 批准并合并；不通过则在 PR 中留言，朋友继续向原 `feature/*` 分支提交修正。

`baseline-2026-09-21` 标签保存本次原始版本。任何时候都可以用 `git switch --detach baseline-2026-09-21` 查看该基线，但不要在标签上开发。

## 比赛演示协作分工

比赛公网版运行在中国大陆云服务器的 Docker Compose 中。`main` 是服务器部署分支，任何前端或后端改动都必须先通过 Pull Request。

- 前端同事使用 `feature/frontend-*` 分支，主要修改 `app/portal/`、`app/ui/` 和样式文件；不得擅自改变 API 字段、订单状态和权限规则。
- 后端负责人使用 `feature/backend-*` 分支，主要修改 `app/server.js`、`app/portal-store.js`、Agent、数据和接口模块；改变接口时必须同步测试和说明。
- 双方合并前运行 `npm test`、`npm run build`，并在浏览器检查相关页面。
- 不提交 `.env`、`data/portal-state.json`、`app/portal/dist/`、`node_modules/` 或 `outputs/`。
- 公网部署命令、服务器准备和比赛前检查见 [`docs/deployment-mainland-demo.md`](docs/deployment-mainland-demo.md)。

## 每次开始工作

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/新的功能名称
```

不要提交 `.env`、`data/portal-state.json`、`node_modules/`、`app/portal/dist/` 或 `outputs/`。`.env` 里可能有模型密钥。

## 冲突处理

如果 GitHub 提示分支落后：

```bash
git fetch origin
git rebase origin/main
```

解决文件中的冲突标记后：

```bash
git add 已解决的文件
git rebase --continue
git push --force-with-lease
```
