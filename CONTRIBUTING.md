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
