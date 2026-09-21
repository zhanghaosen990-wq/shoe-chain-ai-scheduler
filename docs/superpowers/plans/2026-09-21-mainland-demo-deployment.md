# 中国大陆比赛演示部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为鞋链智排准备中国大陆云服务器上的 Docker + Caddy 公网演示部署，并明确前后端协作边界。

**Architecture:** 保持现有 Node 单体服务不拆分。Docker 构建前端产物并运行 `app/server.js`，Caddy 将 80/443 请求反向代理到应用容器，Docker volume 持久化演示状态文件。

**Tech Stack:** Node.js 20、npm、Docker、Docker Compose、Caddy 2、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-09-21-mainland-demo-deployment-design.md`

## Global Constraints

- 比赛评委必须能在中国大陆普通浏览器中打开公网地址，不依赖 VPN。
- 不提交 `.env`、AI 密钥、`data/portal-state.json` 和生成的前端 bundle。
- 本阶段保持同源前后端和现有 API，不引入数据库或生产级认证改造。
- 演示只使用虚构账号和数据，不写入真实客户资料。
- `main` 分支只保留经过测试的比赛稳定版本。

## Review Focus

- 未设置 `DOMAIN` 时，Compose 应在启动前给出明确错误，而不是启动一个不可访问的代理。
- 应用容器重启后，`data/portal-state.json` 必须位于持久化 volume 中。
- 80/443 必须暴露给公网，应用端口 4173 不直接暴露到公网。
- 前端和后端分支必须能通过同一组测试与构建命令合并。
- AI 密钥不能出现在镜像、Git 历史或浏览器响应中。

### Task 1: 添加容器化公网部署配置

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `deploy/docker-compose.yml`
- Create: `deploy/Caddyfile`
- Test: `app/test/deployment-contract.test.js`

**Interfaces:**
- Consumes: existing `npm run build`, `npm start`, `/api/status`, `PORT`, `PORTAL_STATE_FILE`.
- Produces: an app container on internal port 4173, a Caddy public entrypoint on ports 80/443, and named volumes for state and certificates.

- [x] **Step 1: Write the failing deployment contract test**

  The test asserts that the Docker image builds the bundle, uses the health endpoint, persists portal state, exposes only the proxy ports, and includes the collaboration/deployment guide requirements.

- [x] **Step 2: Run the test to verify it fails**

  Run:

  ```bash
  node --test app/test/deployment-contract.test.js
  ```

  Expected: FAIL because the deployment files and guide do not exist yet.

- [x] **Step 3: Add the minimal deployment files**

  The application image must use a build stage with `npm ci` and `npm run build`, then run `node app/server.js` with `PORTAL_STATE_FILE=/app/data/portal-state.json`. Compose must mount `portal_data` at `/app/data`, keep port 4173 internal, and let Caddy proxy `DOMAIN` on ports 80 and 443.

- [x] **Step 4: Run the contract test to verify it passes**

  Run:

  ```bash
  node --test app/test/deployment-contract.test.js
  ```

  Expected: PASS with 2 tests and 0 failures.

### Task 2: Write the domestic deployment and collaboration handoff

**Files:**
- Create: `docs/deployment-mainland-demo.md`
- Modify: `.env.example`
- Modify: `CONTRIBUTING.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the Compose files from Task 1 and the existing GitHub branch/PR flow.
- Produces: exact server preparation commands, environment variable instructions, smoke checks, backup guidance, and role-specific instructions for the user and frontend colleague.

- [x] **Step 1: Document the only required user actions**

  The guide must state how to prepare a mainland public server, open TCP 80/443, point a domain or use `DOMAIN=:80`, create `.env`, run Compose, verify `/api/status`, and share the resulting URL.

- [x] **Step 2: Document frontend and backend responsibilities**

  The collaboration section must name the branch prefixes, owned directories, required checks, API compatibility rule, and PR merge rule.

- [x] **Step 3: Extend CI with a Docker build check**

  Keep the existing unit-test and frontend-build checks, then run:

  ```yaml
  - name: Build deployment image
    run: docker build -t shoe-chain-demo:test .
  ```

- [x] **Step 4: Run the complete local verification**

  Run:

  ```bash
  node --test app/test/*.test.js
  node -e "const fs=require('fs'); if (!fs.existsSync('Dockerfile')) process.exit(1)"
  ```

  Expected: all Node tests pass and the deployment image definition exists. If Docker is installed locally, also run `docker build -t shoe-chain-demo:test .`.

### Task 3: Final handoff

**Files:**
- Review: `docs/deployment-mainland-demo.md`
- Review: `CONTRIBUTING.md`
- Review: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the tested deployment package and current working tree.
- Produces: a concise two-person checklist for the first deployment and the competition rehearsal.

- [x] **Step 1: Check the working tree for secrets or generated files**

  Run:

  ```bash
  git status --short
  git diff --check
  ```

  Expected: `.env`, `node_modules`, generated bundle, state file, and outputs remain ignored; no secret value appears in tracked changes.

- [x] **Step 2: Perform the final verification before claiming completion**

  Run:

  ```bash
  node --test app/test/*.test.js
  ```

  Expected: PASS with 0 failures. Report Docker build status separately if Docker is unavailable locally.
