# 鞋链智排：公网 IP + 端口部署（比赛演示）

最终网址形如 `http://你的公网IPv4:8000`。本方案只有一台云服务器，Docker 直接将公网 8000 端口映射到应用容器。无需购买域名。应用和订单演示状态在容器重建后保留。

> 这是**公开的 HTTP 演示站**。当前账号密码只在各自浏览器的本地存储中校验，服务端没有可靠的登录会话；知道接口的人可以读取或改写演示数据，并可能调用收费的 AI 接口。只放虚构数据，不填真实姓名、手机号、订单、企业密码。建议在模型平台设置余额/额度上限，比赛结束后关闭公网端口或停机。`IP:端口` 也不当然免除中国大陆云厂商的备案或内容管理要求，购买前应查看所选厂商的规则。

## 1. 购买服务器时怎样选

在阿里云 ECS、腾讯云 CVM/轻量应用服务器、华为云 ECS 等控制台购买一台云服务器。控制台名称会略有变化，关键选项如下：

| 选项 | 建议 |
| --- | --- |
| 地域 | 评委在中国大陆时优先大陆节点；**付款前向厂商确认无域名的 IP:8000 演示是否允许，以及备案要求**。若时间来不及满足大陆节点要求，可评估香港节点，但大陆访问速度和稳定性需实测。 |
| 系统镜像 | Ubuntu Server 22.04 或 24.04，x86_64。不要选 Windows 或带整套网站环境的镜像。 |
| 规格 | 先选 2 核 CPU、4 GB 内存、40 GB 以上系统盘。单机演示通常足够；并发人数多再升配。 |
| 网络 | 必须勾选**公网 IPv4**，记录分配的公网 IP。建议有固定公网 IP；如果是按量计费的动态 IP，重启后要重新核对。 |
| 带宽/流量 | 比赛演示可先选 3–5 Mbps；核对月流量额度和超额费用。 |
| 登录方式 | 优先 SSH 密钥；如果用密码，设置强密码并保存于密码管理器。 |
| 计费 | 按比赛日期覆盖购买时长，核对自动续费、到期释放和流量计费。 |

付款和实名认证需要你自己在云厂商账户中完成。购买完成后，在实例详情页找到公网 IPv4，例如 `203.0.113.10`（这里只是格式示例）。

## 2. 放行端口

在实例的**安全组/防火墙**添加入站 TCP 规则：

- `8000`：来源 `0.0.0.0/0`，供评委访问。若修改了 `.env` 中的 `PUBLIC_PORT`，这里也改成同一端口。
- `22`：SSH 管理，来源尽量限定为你当前的公网 IP；若网络地址会变化，使用云厂商网页终端或及时更新规则。

轻量服务器通常有单独的“防火墙”页面；普通 ECS/CVM 通常在“安全组”页面。本方案无需放行 80/443。若服务器还启用了 UFW，也执行 `sudo ufw allow 8000/tcp`；不要在未放行 SSH 的情况下启用 UFW。

## 3. 连接并安装 Docker

在 Mac 的“终端”输入以下命令，把示例 IP 换成真实公网 IP。Ubuntu 云镜像常用用户名 `ubuntu`；若实例说明写的是 `root`，改用 `root@IP`。第一次连接会问是否信任主机指纹，先与云控制台显示的指纹核对。

```bash
ssh ubuntu@203.0.113.10
```

在服务器终端执行：

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo systemctl enable --now docker
sudo docker compose version
```

若最后一步没有显示 Compose 版本，先按 Docker 官方 Ubuntu 安装页补装 Compose plugin。若下载镜像失败，先检查云服务器能否访问 Docker 镜像源，使用所选云厂商提供的官方镜像加速说明，不要随意填陌生镜像站。

## 4. 下载项目并配置密钥

当前仓库地址为 `https://github.com/zhanghaosen990-wq/shoe-chain-ai-scheduler.git`。在服务器终端执行：

```bash
git clone https://github.com/zhanghaosen990-wq/shoe-chain-ai-scheduler.git shoe-chain-demo
cd shoe-chain-demo
cp .env.example .env
chmod 600 .env
nano .env
```

在编辑器中确认或填写这些行：

```dotenv
PUBLIC_PORT=8000
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的DeepSeek密钥
AI_MODEL=deepseek-chat
```

`DOMAIN` 对此 IP 部署文件无效，不用购买域名。模型密钥需要在 DeepSeek 平台由你创建，保存在服务器的 `.env`，不要发在聊天里，也不要提交到 Git。**可以先留空密钥上线网页**，这时 AI 相关功能会失败或降级；正式演示前再填入有效密钥并重启容器。用 `Ctrl+O`、回车保存，`Ctrl+X` 退出 nano。

## 5. 启动和验收

仍在项目目录中运行：

```bash
sudo docker compose --env-file .env -f deploy/docker-compose.ip.yml up -d --build
sudo docker compose --env-file .env -f deploy/docker-compose.ip.yml ps
curl -f http://127.0.0.1:8000/api/status
```

`ps` 应显示 app 为 `healthy`，`curl` 应返回包含 `configured`、`provider` 的 JSON。若密钥已正确填写，`configured` 应为 `true`。然后用**手机流量**打开 `http://你的公网IPv4:8000`，再访问 `http://你的公网IPv4:8000/api/status`。不要在网址中输入尖括号、中文或示例 IP。

从首页到品牌下单、工厂接单做一次完整彩排；另用无痕窗口确认首页可打开。向评委提供准确的 `http://IP:8000` 链接。浏览器可能标记 HTTP 为“不安全”，这是本方案没有 HTTPS 的正常结果，演示时不要输入真实信息。

## 6. 更新、备份和排错

新代码合并到 GitHub `main` 后，在服务器项目目录运行：

```bash
git pull --ff-only origin main
sudo docker compose --env-file .env -f deploy/docker-compose.ip.yml up -d --build
```

演示状态存放在 Docker 的 `portal_data` 卷中。更新前建议备份到项目目录之外：

```bash
sudo docker compose --env-file .env -f deploy/docker-compose.ip.yml cp app:/app/data/portal-state.json ../portal-state.backup.json
sudo chmod 600 ../portal-state.backup.json
```

若尚未产生状态文件，备份命令会报文件不存在，可先完成一次订单操作再重试。不要执行带 `-v` 的 `docker compose down`，它会删除数据卷。备份文件可能包含演示资料，不要提交 Git。

打不开时按顺序检查：

1. `sudo docker compose --env-file .env -f deploy/docker-compose.ip.yml ps`：容器是否运行并健康；
2. `curl -f http://127.0.0.1:8000/api/status`：服务器本机是否能访问；
3. 云控制台的公网 IPv4、安全组/轻量防火墙是否放行 TCP 8000；
4. `sudo docker compose --env-file .env -f deploy/docker-compose.ip.yml logs --tail=100 app`：查看错误，**不要把可能含有密钥的完整日志公开发送**。

若本机 `curl` 成功但手机流量打不开，问题通常在云防火墙、公网 IP、云厂商限制或本机 UFW。若端口被占用，先用 `sudo ss -ltnp | grep ':8000'` 查占用，再在 `.env` 里换一个允许的 `PUBLIC_PORT`，同时修改安全组和验收网址。

比赛结束后，在云控制台关闭 8000 入站规则，或执行 `sudo docker compose --env-file .env -f deploy/docker-compose.ip.yml down` 停止服务；不要加 `-v`。如需长期对公众提供服务，应先补服务端认证、限流、HTTPS 与正式数据存储。

## 7. 评委注册和体验方式

首页已有“注册账号”。评委可以在**同一台设备的同一个浏览器**中注册品牌方或工厂端账号，退出后用同一浏览器登录。账号和密码只保存在该浏览器，换设备、换浏览器或清理浏览数据后不能用原账号登录。相同用户名在另一台设备仍可注册成另一个账号；因此这不是正式网站的账号体系。

如果评委只想快速看功能，可用页面预置的演示账号：品牌 `brand_01`，工厂 `factory_01`，初始密码均为 `123456`。这是公开演示密码，各评委会共享相应的服务器演示资料，互相操作可能影响订单状态。正式提交前，用手机流量和无痕窗口各彩排一次，并在邮件里说明“可自行注册”与“演示账号”两种入口。可复制的邮件文案见 [评委体验邮件模板](judge-email-template.md)。
