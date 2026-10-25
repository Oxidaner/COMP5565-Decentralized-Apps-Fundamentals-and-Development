# COMP5565: Decentralized Product Provenance and Warranty dApp

五人小组项目。当前处于方案讨论与协作工作区搭建阶段，尚未实现合约或前端；CI 的文档检查通过不代表课程功能已经验收。

## 从这里开始

1. 阅读 [三个方案与推荐架构](docs/proposal.md)，确认链、隐私边界与保修规则。
2. 按 [五人分工与里程碑](docs/team.md) 认领负责人，并使用 [协作流程](docs/workspace.md) 创建任务和 PR。
3. 开发时对照 [验收矩阵](docs/acceptance.md)；其中标明了自动化证据与现场演示证据。

仓库内的 [课程原始要求](docs/COMP5565%20Decentralized%20Apps%20Fundamentals%20and%20Development.pdf) 是最终依据。组长须在 **2026-11-01** 前登记小组；报告、代码压缩包和幻灯片的截止时间为 **2026-12-01 23:59:00**（课程文件未注明时区，以课程平台通知为准）。

## 工作区

| 路径 | 用途 |
| --- | --- |
| `docs/` | 方案、验收、分工与原始要求；后续放报告素材 |
| `packages/contracts/` | 选定 Ethereum 方案后放 Solidity、部署脚本及合约测试 |
| `apps/web/` | 选定网站前端后放用户界面及前端测试 |
| `scripts/` | 工作区与提交包检查 |
| `.github/` | PR、任务模板和 CI |
| `.agent/` | Agent 执行工作流；项目级规则入口是 `AGENTS.md` |

代码目录会在方案确认并开始实现时创建，避免空目录让 CI 误以为功能已经完成。若选择 Fabric，先更新方案、验收证据和 CI，再建立相应代码目录。

运行当前检查：

```sh
python3 scripts/check_workspace.py
```

最终提交包准备好后，使用 `python3 scripts/check_submission.py --group <组号>` 核对文件命名和 ZIP 内容。报告排版、引用质量和现场演示仍需人工复核。
