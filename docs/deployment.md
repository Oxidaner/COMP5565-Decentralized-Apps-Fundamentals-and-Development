# 静态网站与 Sepolia 部署

首次使用可以先按 [页面操作指南](user-guide.md) 完成本地测试，无需领取 SepoliaETH。本文件用于本地流程跑通后的线上发布与多人协作。

## 两部分分别上线

- **网站**：GitHub Pages 发布 `apps/web/dist/`，没有常驻业务服务器或数据库。`.github/workflows/pages.yml` 运行测试、编译合约、导出钱包部署用的 ABI/bytecode，再构建 Sepolia 前端。
- **合约**：管理员在页面中连接自己的 Sepolia 钱包并签名部署。没有钱包签名和确认回执时，不能声称合约已经上线。
- **本地课程演示**：保持 `VITE_NETWORK=local` 的默认值及 Hardhat 31337，不被线上版本替代。

## 网站发布

仓库使用 GitHub Pages 的 GitHub Actions 模式；当前 `main` 与实现分支 `project-planning-workspace` 的推送都会触发发布，同一时刻只执行一个发布任务。未来合并到 `main` 后可删掉实现分支的触发项。

构建无需部署私钥和 RPC 密钥，公开 Sepolia RPC 默认是 `https://ethereum-sepolia-rpc.publicnode.com`。若该服务限流，应在构建时设置另一个支持浏览器访问的 `VITE_RPC_URL`，不要在公开前端填服务器私密 API 密钥。

手动构建：

```sh
npm --prefix packages/contracts ci
npm --prefix apps/web ci
VITE_NETWORK=sepolia npm --prefix apps/web run build
```

生成的 `apps/web/dist/` 可托管在任何静态服务器。`prebuild` 会从本仓库 Solidity 编译产物导出 `ProductWarranty.json`；该产物和编译 cache 不加入 Git。Vite 6.1.0 默认根路径是 `/`，这里改为 `./`，使 GitHub Pages 仓库子路径可正常加载资源与部署产物。

## 管理员首次操作

1. 使用自己控制的浏览器钱包，切到 **Sepolia，Chain ID 11155111**；钱包需要少量 Sepolia 测试 ETH。使用新建的测试账户，不使用公开 Hardhat 测试私钥或主网资金。
2. 打开网站，检查 `Network setup` 显示 Sepolia。首次会显示 `No contract connected yet`，此时没有团队产品数据。
3. 点击 `Deploy new contract with wallet`，在钱包检查并确认部署交易，等页面显示绿色“合约部署成功”。“部署交易已提交”仍在等待确认。这个钱包成为合约唯一管理员，当前合约不支持管理员更换。
4. 展开 `Connect or deploy the team contract`，保存合约地址和 `Deployment block`。`Team link` 已包含两者，可直接复制给五位组员；无需重新构建网站。
5. 在 `Administrator: team roles` 输入各人的钱包地址并选择 `Manufacturer`、`Retailer`、`ServiceCenter`，逐笔 `Grant role` 并确认交易。消费者不需要授权。可以先授权自己的地址为制造商注册测试产品，但组员演示应使用各自钱包。
6. 制造商在工作台注册虚构产品，团队就能按原有两步销售、保修和转售流程使用。浏览器部署不会自动注册 `DEMO-001`，这个演示产品只有本地部署脚本会创建。

## 加入已有团队

优先打开管理员提供的完整团队链接。也可手动输入合约地址和部署区块再点击 `Connect contract`；页面会通过 RPC 读取 `admin()`，确认当前链有可调用的合约，区块不能高于当前链高度。Sepolia 不允许以 0 作为部署区块，避免从创世区块扫描。

团队链接只包含公开链 ID、地址和区块，不包含钱包私钥、个人信息或可替换的 RPC。浏览器记住连接设置不等于保存业务数据。更换团队合约会清空当前页面已加载的产品和钱包显示。

查询不需要连接钱包；写入需要钱包位于当前页面指定网络。所有权历史从配置的部署区块开始，每次最多查询 5000 个区块。过高的部署区块会遗漏早期事件，应以部署交易回执为准。公共 RPC 暂时不可用时，应等待恢复而不是重复发送已确认交易。

## 尚需真人完成的验收

网页发布成功只证明静态站可访问。Sepolia 合约是否已部署、管理员角色是否授权、组员实际交易是否完成，以链上回执和现场钱包操作为准。课程要求的本地部署、正式报告、gas 实测与课堂展示仍分别验收。
