# 中国大陆比赛公网部署说明

这份说明是给你和前端同事用的。目标是：评委在中国大陆，直接打开公网地址，不需要 VPN。

## 你需要准备的东西

你只需要准备三样：

1. 一台中国大陆云服务器，建议 Ubuntu 22.04/24.04、2 核 4 GB、带公网 IPv4；
2. 云服务器安全组放行 TCP `80` 和 `443`；
3. 一个已经指向服务器公网 IP 的域名。

如果比赛时间很紧、暂时没有域名，可以先用公网 IP：把 `.env` 中的 `DOMAIN` 写成 `:80`，访问 `http://服务器公网IP`。这不需要 VPN，但没有 HTTPS；演示认证会在缺少安全上下文 API 时使用浏览器安全随机数与内置 SHA-256 兼容实现。正式演示仍建议使用域名和 HTTPS。

域名在中国大陆云服务器上的备案要求由云厂商和具体用途决定，请按服务器供应商页面办理或确认。服务器必须有公网 IP，不能是公司内网机器。

## 第一次部署

在服务器终端执行：

```bash
sudo apt update
sudo apt install -y git
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
git clone 你的 GitHub 仓库地址 shoe-chain-demo
cd shoe-chain-demo
cp .env.example .env
```

编辑 `.env`，至少填写：

```dotenv
# 有域名时写域名；没有域名时暂时写 :80
DOMAIN=demo.example.com

AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的DeepSeek密钥
AI_MODEL=deepseek-chat
```

然后启动：

```bash
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
curl -f http://127.0.0.1/api/status
```

看到 JSON 返回后：

- `DOMAIN=demo.example.com`：打开 `https://demo.example.com`；
- `DOMAIN=:80`：打开 `http://服务器公网IP`。

有域名时，Caddy 会自动申请并续期 HTTPS 证书。DNS、云安全组和域名必须已经生效，证书才会成功申请。

## 更新代码

比赛版本合并到 `main` 后，在服务器执行：

```bash
git pull --ff-only origin main
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

业务状态保存在 Docker volume 中，容器重建不会主动删除订单、资料和评价。比赛前建议先备份：

```bash
docker compose --env-file .env -f deploy/docker-compose.yml exec app sh -c 'cp /app/data/portal-state.json /app/data/portal-state.backup.json'
```

不要执行 `docker compose down -v`，这个命令会删除演示数据和 Caddy 证书卷。

## 你负责什么

- 准备中国大陆云服务器、公网 IP、安全组和域名；
- 在服务器上创建 `.env`，填写 DeepSeek 密钥；
- 负责 `feature/backend-*` 分支和后端 API；
- 后端改接口时同步更新测试和接口说明；
- 合并前运行 `npm test` 和 `npm run build`；
- 比赛前完成一次从首页到品牌下单、工厂接单的完整彩排。

## 前端同事负责什么

- 从 `main` 创建 `feature/frontend-页面名称` 分支；
- 主要修改 `app/portal/`、`app/ui/`、`app/styles.css` 和相关样式；
- 不修改接口字段、订单状态和权限规则；
- 页面改完运行 `npm test`、`npm run build`，并用手机宽度检查页面；
- 提交 Pull Request，说明改了什么、如何验证；
- 不把 `.env`、密钥、`data/portal-state.json` 或 `app/portal/dist/` 提交到 Git。

## 比赛前检查清单

- [ ] 手机流量下可以打开公网地址；
- [ ] 无痕窗口可以打开首页；
- [ ] 品牌演示账号可以登录；
- [ ] 工厂演示账号可以登录；
- [ ] BOM 演示数据可以填入；
- [ ] 没有 AI 密钥时，关键词推荐和手动选厂仍能演示；
- [ ] 品牌提交订单后，工厂账号能看到待接单提醒；
- [ ] 浏览器刷新后页面仍能打开；
- [ ] 已备份 `portal-state.json`；
- [ ] 已准备公网链接、账号和密码的纸面/离线备份。

## 这套部署不适合什么

当前认证仍是演示认证，不能作为正式生产系统。不要使用真实姓名、手机号、客户订单、真实企业密码或真实生产数据。比赛结束后，如果要长期使用，再升级为服务端 Session/JWT、数据库和对象存储。
