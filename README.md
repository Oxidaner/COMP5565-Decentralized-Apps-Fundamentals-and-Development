# COMP5565: Decentralized Product Provenance and Warranty dApp

五人小组项目。已确认采用方案 1：本地 Hardhat Ethereum + Solidity 合约 + React/Vite 网站直连合约。

## 从这里开始

1. 阅读 [三个方案与已确认架构](docs/proposal.md)，了解链、隐私边界与保修规则。
2. 按 [五人分工与里程碑](docs/team.md) 认领负责人，并使用 [协作流程](docs/workspace.md) 创建任务和 PR。
3. 开发时对照 [验收矩阵](docs/acceptance.md)；其中标明了自动化证据与现场演示证据。

仓库内的 [课程原始要求](docs/COMP5565%20Decentralized%20Apps%20Fundamentals%20and%20Development.pdf) 是最终依据。组长须在 **2026-11-01** 前登记小组；报告、代码压缩包和幻灯片的截止时间为 **2026-12-01 23:59:00**（课程文件未注明时区，以课程平台通知为准）。

## 工作区

| 路径 | 用途 |
| --- | --- |
| `docs/` | 方案、验收、分工与原始要求；后续放报告素材 |
| `packages/contracts/` | Solidity 合约、部署脚本及合约验收测试 |
| `apps/web/` | React/Vite/TypeScript 用户界面及前端验收测试 |
| `scripts/` | 工作区与提交包检查 |
| `.github/` | PR、任务模板和 CI |
| `.agent/` | Agent 执行工作流；项目级规则入口是 `AGENTS.md` |

运行检查：

```sh
python3 scripts/check_workspace.py
```

启动本地演示：

```sh
npm --prefix packages/contracts install
npm --prefix packages/contracts run node
# 新终端
npm --prefix packages/contracts run deploy
npm --prefix apps/web install
cp apps/web/.env.example apps/web/.env.local
# 将部署输出的 Contract 地址填入 .env.local 的 VITE_CONTRACT_ADDRESS
npm --prefix apps/web run dev
```

需要 Node.js 24（与 CI 一致）。为了按锁文件安装，可将上述 `install` 替换为 `ci`。浏览器钱包添加本地网络：RPC `http://127.0.0.1:8545`、Chain ID `31337`、货币符号 `ETH`。写操作会拒绝其他网络；查询不需要钱包。

部署脚本使用 Hardhat 账号 0/1/2/3 分别作为管理员、制造商、零售商和服务中心；账号 4/5 可作为消费者和二手消费者。按节点启动输出导入这些本地测试账号，勿向其转入真实资产。演示产品为 `DEMO-001 / SN-DEMO-001`。

先查询演示产品，再用制造商发起转给零售商、零售商接收；零售商再转给消费者，消费者接收后启动保修。随后消费者提交理赔，服务中心批准并完成维修，最后消费者可转售给二手消费者。切换钱包账户或网络后，页面会提示重新连接。详细步骤见 [网站指南](apps/web/README.md)。

重启 Hardhat 节点会清空本地链；需要重新部署并核对合约地址。修改 `.env.local` 后需要重启 Vite，钱包若保留旧链交易状态也应重置该测试账户的活动数据。

合约验收与网站验收命令见各目录的 README。CI 会执行完整编译、验收测试、lint 和网站构建；这些结果仍不能替代现场钱包交互、报告版面和演示验收。

最终提交包准备好后，使用 `python3 scripts/check_submission.py --group <组号>` 核对文件命名和 ZIP 内容。报告排版、引用质量和现场演示仍需人工复核。
