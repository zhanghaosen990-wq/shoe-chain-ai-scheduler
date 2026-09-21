# GitHub Collaboration Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布当前完整版本到 GitHub，并建立朋友提交、所有者测试审批后才能合并的受保护协作流程。

**Architecture:** 以 `main` 作为受保护、可部署的基线分支，所有开发通过短期 `feature/*` 分支和 Pull Request 流入。Git 标签保存当前不可变样本快照，CODEOWNERS、GitHub Actions 和分支保护共同执行审批与测试门禁。

**Tech Stack:** Git、GitHub Pull Requests、GitHub Actions、Node.js 20、Docker

**Spec:** `docs/superpowers/specs/2026-09-21-github-collaboration-protection.md`

## Global Constraints

- 不提交 `.env`、`data/portal-state.json`、`app/portal/dist/`、`node_modules/`、`outputs/` 或 `tmp/`。
- 保留已有比赛说明 PDF 和演示数据。
- 不覆写或强推 `main`。
- 当前版本必须通过测试、前端构建和 Docker 构建。

## Review Focus

- 密钥或本地运行数据被误提交：发布前扫描已暂存文件和常见密钥模式。
- 原始样本被删除或覆盖：恢复 PDF，并检查演示数据仍在版本控制中。
- 协作者绕过所有者直接合并：要求 Pull Request、Code Owner 审核和至少一个批准。
- 未测试的变更进入 `main`：要求 CI 的 `test` 检查成功。
- 当前基线在后续开发后难以恢复：创建带日期且指向发布提交的受保护标签。

---

### Task 1: 固定仓库协作契约

**Files:**
- Create: `.github/CODEOWNERS`
- Modify: `.github/PULL_REQUEST_TEMPLATE.md`
- Modify: `CONTRIBUTING.md`
- Restore: `2026首届“永嘉农商杯”AI＋OPC创新创业大赛赛道说明（定）.pdf`

**Interfaces:**
- Consumes: GitHub 用户 `@zhanghaosen990-wq` 和现有 `Check` 工作流。
- Produces: 所有文件变更需所有者审核的 CODEOWNERS 规则，以及朋友可照做的 PR 流程。

- [ ] **Step 1: 恢复被删除的比赛说明 PDF**

Run: `git restore --source=HEAD -- '2026首届“永嘉农商杯”AI＋OPC创新创业大赛赛道说明（定）.pdf'`

Expected: `git status --short` 不再显示该 PDF 被删除。

- [ ] **Step 2: 添加所有权规则**

Create `.github/CODEOWNERS` with:

```text
* @zhanghaosen990-wq
```

- [ ] **Step 3: 在协作说明和 PR 模板中固定职责**

写明朋友只能推送 `feature/*` 分支、不得直接改 `main`，所有者负责运行 `npm test`、`npm run build` 并在 GitHub 批准后合并。

- [ ] **Step 4: 验证忽略规则和样本存在**

Run: `git check-ignore .env data/portal-state.json app/portal/dist/main.js node_modules outputs tmp`

Expected: 所有路径均被忽略；比赛 PDF 和 `data/demo_data.json` 均存在。

### Task 2: 验证并发布当前版本

**Files:**
- Modify: 当前工作区所有已跟踪及新增项目文件
- Verify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm test`、`npm run build`、`Dockerfile`。
- Produces: 可由 GitHub Actions 重复验证的完整版本提交。

- [ ] **Step 1: 运行单元测试**

Run: `npm test`

Expected: 退出码 0，全部测试通过。

- [ ] **Step 2: 运行生产构建**

Run: `npm run build`

Expected: 退出码 0，生成的 `app/portal/dist/` 仍保持忽略。

- [ ] **Step 3: 构建部署镜像**

Run: `docker build -t shoe-chain-demo:baseline .`

Expected: 退出码 0。

- [ ] **Step 4: 扫描暂存清单与常见密钥**

Run: `git diff --cached --name-only` and `git grep -n -I -E '(sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)' -- ':!package-lock.json'`

Expected: 没有本地密钥、运行时数据或忽略产物进入提交。

- [ ] **Step 5: 提交并推送版本分支**

Run: `git commit -m "feat: publish protected collaboration baseline"` then `git push -u origin <current-branch>`

Expected: GitHub 远端分支指向本地提交。

### Task 3: 建立 GitHub 合并门禁并固定基线

**Files:**
- GitHub repository settings: branch protection for `main`
- Git refs: `baseline-2026-09-21`

**Interfaces:**
- Consumes: Task 2 的发布提交和 GitHub `test` 检查。
- Produces: 只有 CI 通过且所有者批准后才能进入 `main` 的流程。

- [ ] **Step 1: 创建 Pull Request 到 `main`**

Expected: PR 显示完整变更，目标分支为 `main`，CI 自动运行。

- [ ] **Step 2: 配置 `main` 分支保护**

要求 Pull Request、1 个批准、Code Owner 审核、`test` 状态检查、对管理员生效，并禁止强推和删除。

- [ ] **Step 3: 在检查通过后合并本次基线**

Expected: `origin/main` 包含本次提交，未使用强推。

- [ ] **Step 4: 创建并推送不可变基线标签**

Run: `git tag -a baseline-2026-09-21 -m "Protected collaboration baseline 2026-09-21" <merge-or-release-commit>` then `git push origin baseline-2026-09-21`

Expected: GitHub 上标签准确指向已验证版本。

- [ ] **Step 5: 从远端复核**

Run: `git fetch origin --prune --tags` and `git ls-remote --heads --tags origin`

Expected: `main`、版本分支和基线标签均存在，工作区没有未提交项目文件。
