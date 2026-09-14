# 鞋链智排原型运行说明

这是无需安装 npm 依赖的本地网页演示原型。它使用本地模拟数据，展示 Agent 按顺序调用工厂能力、产能排期、物料风险三类“业务工具”，再输出拆单建议。

## 接入 DeepSeek

1. 在项目根目录将 `.env.example` 复制为 `.env`（已有 `.env` 时直接编辑它）。
2. 填入 DeepSeek 控制台创建的密钥：`DEEPSEEK_API_KEY=sk-...`；密钥只在本地服务端读取，切勿填到网页或提交给他人。
3. 保持 `AI_PROVIDER=deepseek` 与 `AI_MODEL=deepseek-chat`，保存后重启服务。

服务会通过 DeepSeek 的 OpenAI 兼容 Chat Completions 接口发起工具调用。网页中的工厂、产能和物料仍是本地模拟数据，模型无法自行下单。

## 运行

在项目根目录执行：

```bash
/Users/a1/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node app/server.js
```

随后在浏览器访问 `http://localhost:4173`。终端窗口必须保持打开；关闭窗口会停止原型服务。

## 当前演示流程

1. 保持默认的 800 双商务男鞋订单，点击“启动智能调度”。
2. 观察 Agent 五步执行记录。
3. 查看推荐：瓯越精工鞋业（模拟）生产 500 双，楠江鞋业制造（模拟）生产 300 双。
4. 点击“提交人工审批”或“生成询单消息”，展示业务闭环。

所有数据均为模拟数据。当前版本的调度决策采用可审计的业务规则，尚未接入真实大模型；下一阶段会将自然语言理解与方案解释交给大模型，同时保留数据工具与人工审批机制。
