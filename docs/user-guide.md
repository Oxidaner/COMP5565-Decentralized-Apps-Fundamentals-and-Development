# 页面操作指南

第一次使用建议先完成本地测试。你可以在自己的电脑上操作产品登记、销售、保修和转售，不需要领取 SepoliaETH。

打开页面后，浅绿色的“接下来”提示会根据合约连接、当前产品、转让期限和理赔状态说明下一步，并可带你定位到相应输入框或按钮。涉及不同钱包角色时，按提示切换账户并连接当前网站，再核对地址。引导不会代替你点击业务按钮或确认钱包交易；已批准理赔会优先提示登记实际维修结果。

每次操作会在相应区域及页面右下角显示反馈：蓝色表示处理中，绿色表示确认成功，红色表示未完成及具体原因，黄色表示需要核对结果。通知可以关闭，操作区域仍保留当前结果。空字段、错误账户、重复处理或钱包拒绝都会给出说明；交易已提交但暂时查不到结果时，先核对钱包活动记录，不要重复发送。

## 1. 先选本地测试

| 项目 | 本地测试 | 线上多人协作 |
| --- | --- | --- |
| 打开的页面 | 本机启动的 Vite 网页 | 已发布的 GitHub Pages 网页 |
| 连接的链 | 本机 Hardhat，Chain ID `31337` | Sepolia，Chain ID `11155111` |
| 手续费来源 | Hardhat 测试账户自带的模拟 ETH | 各自钱包领取的 SepoliaETH |
| 合约部署 | 运行脚本，自动配置角色和演示产品 | 管理员在网页中部署，再授权组员 |
| 适合用途 | 个人练习、反复调试、课堂本地演示 | 不同电脑共享同一份产品记录 |

两种方式都需要部署合约。下面的本地部署发生在自己的电脑里，不会向公共网络发送交易。

当前线上网页使用 Sepolia。本地测试请打开下面启动的本地网页，仅把钱包切到本地网络不会改变线上网页连接的链。

## 2. 准备环境

准备项目源码、Node.js 和浏览器钱包。项目 CI 使用 Node.js 24，建议本地使用相同版本。以下钱包操作以 MetaMask 浏览器扩展为例。

在终端检查：

```sh
node --version
npm --version
```

后面的命令都在项目根目录执行，也就是能看到 `README.md`、`apps/` 和 `packages/` 的目录。本机路径是：

```sh
cd /Users/oxidaner/polyu/project/5565
```

组员替换为各自的项目路径。每开一个新终端，都先进入项目根目录。

首次安装依赖：

```sh
npm --prefix packages/contracts ci
npm --prefix apps/web ci
```

如果已经安装了与锁文件一致的依赖，可以从下一步开始。

## 3. 启动本地链和网页

需要两个终端同时运行：终端 A 保持本地链运行，终端 B 完成部署后保持网页运行。

### 3.1 终端 A：启动本地链

```sh
npm --prefix packages/contracts run node
```

看到 RPC 服务地址以及 `Account #0`、`Account #1` 等账户列表，就表示启动成功。每个账户旁边会显示地址、模拟余额和 `Private Key`。

保持这个终端运行。后面导入钱包时，还需要查看这里的账户信息。

### 3.2 终端 B：部署本地合约

进入项目根目录，执行：

```sh
npm --prefix packages/contracts run deploy
npm --prefix packages/contracts run export:web
```

部署成功后会输出：

```text
Contract: 0x...
Admin: 0x...
Manufacturer: 0x...
Retailer: 0x...
Service center: 0x...
Demo product: DEMO-001 / SN-DEMO-001
```

记下 `Contract` 后面的地址，稍后填入网页。脚本已经配置好角色，并登记了演示产品，不需要再从网页部署一份合约。

`export:web` 会生成网页部署入口需要的合约文件，不会再部署一个合约。

### 3.3 检查已有的本地配置

如果没有 `apps/web/.env.local`，可以直接继续，代码默认连接本地 Hardhat。

如果已有这个文件，保留其他内容，检查以下两项是否指向本地：

```dotenv
VITE_NETWORK=local
VITE_RPC_URL=http://127.0.0.1:8545
```

本指南通过网页输入合约地址，所以不要求配置 `VITE_CONTRACT_ADDRESS`。已有的地址可以在网页中替换。

### 3.4 在终端 B 启动网页

```sh
npm --prefix apps/web run dev
```

打开终端输出的本地地址，通常为：

```text
http://localhost:5173/
```

如果端口被占用，Vite 会选择其他端口，以终端实际输出为准。保持终端 B 运行。

### 3.5 在网页中连接刚才部署的合约

1. 找到页面顶部的 `Network setup`，确认显示 `Local Hardhat` 和 Chain ID `31337`。
2. 展开 `Connect or deploy the team contract`。
3. 在 `Contract address` 填入终端 B 输出的合约地址。
4. 在 `Deployment block` 填 `0`。这个填法只用于本地演示；Sepolia 需要真实部署区块。
5. 点击 `Connect contract`，等待出现“合约连接成功”。

此时不需要连接钱包。接下来即可查询演示产品。

这里的 `Contract address` 必须使用部署输出的 **Contract 地址**。制造商、零售商和管理员的钱包地址填在其他业务字段，不填在这里。切换操作角色时不需要修改这个合约地址。

本地 `deploy` 脚本已经授权了制造商、零售商和服务中心，直接开始第 4、5 节即可。`Administrator: team roles` 只在新增或撤销机构角色时使用；本地管理员是 `Local Admin / Account #0`，制造商无法代替管理员授权。

## 4. 先查询产品，再配置钱包

### 4.1 不连接钱包查询

在 `Find a product` 中输入：

| 字段 | 内容 |
| --- | --- |
| Product ID | `DEMO-001` |
| Serial number | `SN-DEMO-001` |

点击 `Verify product`。首次部署后的预期结果：

- 型号为 `Demo Phone`，当前所有者为制造商地址。
- 保修状态为 `Waiting for first customer acceptance`。
- 获批理赔次数为 `0 / 3`。
- 尚无已完成的转让记录。

查到记录表示存在授权制造商登记的链上记录，不能单独证明手里的实物没有被仿冒。

### 4.2 给钱包添加本地网络

在 MetaMask 的网络选择界面添加自定义网络，填写：

| 配置项 | 值 |
| --- | --- |
| Network name | `Local Hardhat` |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |
| Block explorer | 留空 |

保存后切换到这个网络。

### 4.3 导入本地测试账户

在钱包中选择导入账户，使用终端 A 显示的对应 `Private Key`。编号以 Hardhat 输出的 `Account #...` 为准，建议导入后按下表重命名：

| Hardhat 账户 | 建议的钱包名称 | 用途 |
| --- | --- | --- |
| `Account #0` | `Local Admin` | 管理员，添加或撤销机构角色 |
| `Account #1` | `Local Manufacturer` | 制造商，登记产品、发起第一次转让 |
| `Account #2` | `Local Retailer` | 零售商，接收产品、销售给消费者 |
| `Account #3` | `Local Service Center` | 服务中心，审批理赔、登记维修结果 |
| `Account #4` | `Local Customer` | 消费者，接收产品、申请保修、转售 |
| `Account #5` | `Local Resale Customer` | 二手消费者，接收转售产品 |

这些账户自带本地模拟 ETH。公开测试私钥只用于本地测试，不用于 Sepolia 或存放真实资产。私钥只粘贴到钱包的导入界面，网页中的收件人和组员字段填写钱包地址。

一名组员可以切换多个测试账户，六个钱包不代表需要六名组员。

## 5. 在页面走完一次业务流程

### 5.0 每次切换角色，先确认网站连接的是哪个账户

1. 在 MetaMask 顶部的账户选择器中选择本步骤需要的账户，例如 `Local Retailer`。
2. 查看 MetaMask 底部当前网站 `localhost:5173` 的连接状态。若显示“未连接”，点击旁边的“连接”。如果使用的是弹窗界面，通过当前网站的连接/权限入口把该账户连接进来。首次连接还需完成钱包显示的账户选择与连接确认。
3. 回到网页点击 `Connect wallet`。对比网页顶部地址与 MetaMask 当前账户地址，必须一致。
4. 点击 `Verify product` 读取最新产品状态，然后再做业务操作。

只在 MetaMask 列表里选中另一个账户，可能仍让网站使用先前已连接的账户。实测中，选择未连接的消费者账户时，网页仍保留旧账户，直到在 MetaMask 内点击该账户的“连接”。如果两边地址不一致，先检查第 2 步。

本地默认测试地址如下，可与终端部署输出核对。收件人字段填写整段地址：

| 角色 | 本地钱包地址 |
| --- | --- |
| Admin | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Manufacturer | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Retailer | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Service Center | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |
| Customer | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |
| Resale Customer | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` |

每笔写操作都需要在钱包确认交易，等待网页出现绿色“操作成功”及对应的成功说明后再进行下一步。“交易已提交”仍在等待确认。下面的操作始终针对已查询并显示的产品。

本地钱包会显示模拟 gas 费，有些版本还显示美元估值。先核对交易网络为 `Local Hardhat`，请求来自本地网页；这些数值属于本地模拟链，不会扣除银行卡或真实主网 ETH。

### 5.1 制造商把产品转给零售商

1. 切换到 `Local Manufacturer`，连接钱包并查询演示产品。
2. 在 `Transfer ownership` 的收件人字段填入 `Local Retailer` 的钱包地址。
3. 点击 `Start transfer`，在钱包确认交易。
4. 切换到 `Local Retailer`，重新连接并查询。
5. 在待接收区域点击 `Accept`，在钱包确认交易。

预期：当前所有者变为零售商，历史增加一次转让，保修仍未开始。

### 5.2 零售商销售给消费者

1. 使用 `Local Retailer`，发起转给 `Local Customer` 的转让。
2. 切换到 `Local Customer`，重新连接并查询。
3. 点击 `Accept` 并确认交易。

预期：当前所有者变为消费者；保修激活，显示开始时间、结束时间和 `Active`，次数仍为 `0 / 3`。

转让默认需要在 10 分钟内接收。超时后可以点击 `Expire` 清理，再由当前所有者重新发起；发起者也可以 `Cancel`，指定接收者可以 `Reject`。

### 5.3 消费者提交理赔

1. 使用 `Local Customer`，连接并查询产品。
2. 在 `Submit a claim` 选择问题类型，例如 `Battery`。
3. 点击 `Submit claim` 并确认交易。
4. 在 `Claim history` 记下新申请的编号。全新演示产品的第一笔为 `1`，以后以页面显示为准。

预期：申请状态为 `Pending`。同一件产品不能同时再创建第二笔待处理申请。

### 5.4 服务中心批准并完成维修

1. 切换到 `Local Service Center`，重新连接并查询。
2. 在 `Process a claim` 填入刚才的 `Claim ID`。
3. 点击 `Approve`，在钱包确认交易。
4. 查看申请变为 `Approved`，获批次数变为 `1 / 3`。
5. 选择服务结果，例如 `Repaired`，点击 `Complete` 并确认交易。

预期：申请变为 `Serviced`，记录处理人、维修人和时间。`Approved` 只表示批准，尚未表示维修完成。

如需测试拒绝路径，在处理一笔 `Pending` 申请时点击 `Reject`。拒绝不消耗理赔次数，当前所有者可以重新申请；已批准的申请不能再拒绝。

### 5.5 消费者转售给二手消费者

1. 使用 `Local Customer`，发起转给 `Local Resale Customer` 的转让。
2. 切换到 `Local Resale Customer`，重新连接并查询。
3. 点击 `Accept` 并确认交易。

预期：所有者更新，所有权历史增加记录；原保修日期、获批次数和已完成维修记录保持不变。

如果接收转售时还有旧的 `Pending` 申请，它会变为 `CancelledByTransfer`。旧的 `Approved` 申请会保留，服务中心仍能完成维修。

### 5.6 登记自己的新产品

切换到 `Local Manufacturer`，在 `Register product` 填写：

| 字段 | 示例 |
| --- | --- |
| Product ID | `TEST-002` |
| Serial number | `SN-TEST-002` |
| Model | `Test Phone` |
| Warranty months | `24` |
| Max claims | `3` |

点击 `Register product` 并确认交易。页面会加载新产品，初始所有者为制造商。月份按每月 30 天计算，所以 24 个月对应 720 天。

产品 ID 和序列号都必须未被使用。登记资料和保修条款不能修改，测试另一件产品时换一组新编号。

## 6. 测试结束和下次启动

在运行网页和本地链的终端分别按 `Ctrl+C`，即可停止服务。

重新启动 Hardhat 节点会清空这条本地链的产品、角色和交易记录。下次操作时重新执行第 3 节的启动、部署和连接步骤。已有钱包账户可以继续使用，但要核对这次部署输出的合约地址。

只刷新网页、切换钱包账户或重新查询产品，都不需要重新部署。仅重启网页服务、保持本地链运行时，链上数据仍然保留。

## 7. 常见问题

| 现象 | 处理方式 |
| --- | --- |
| 页面显示 Sepolia，钱包显示本地网络 | 打开本地 Vite 网页；检查已有 `.env.local` 中的网络和 RPC，修改后重启 Vite |
| 本地操作提示 SepoliaETH 不足 | 正在使用 Sepolia；检查页面的目标网络和钱包网络是否都是本地 Hardhat |
| 无法连接 `127.0.0.1:8545` | 确认终端 A 的 Hardhat 节点仍在运行 |
| `No contract connected yet` | 在 `Network setup` 输入部署脚本输出的地址，本地部署区块填 `0`，点击 `Connect contract` |
| “这个地址在目标网络上没有合约代码” | 这里可能填了钱包地址，或本地链重启后尚未部署；使用本次部署输出的 Contract 地址 |
| 找不到演示产品 | 确认已运行本地 `deploy` 脚本；浏览器部署入口不会自动创建该产品 |
| `NotCurrentOwner`、`NotManufacturer` 或 `NotServiceCenter` | 核对钱包账户与本指南的角色表，重新连接，再查询产品 |
| 切换账户后网页还是旧地址，或出现 `NotTransferRecipient` | 在 MetaMask 内把新账户连接到当前网站，再点击网页 `Connect wallet`，核对地址一致后查询 |
| “只有管理员可以修改角色”或旧版 `unknown custom error`、数据 `0x7bfa4b9f` | 授权角色需要部署者。切到 `Local Admin` 并连接网站；本地脚本已授权的演示角色无需重复授权 |
| `TransferExpired` | 清理超时转让，再由当前所有者发起新转让 |
| 显示交易已确认，但刷新失败 | 重新查询产品，不重复发送已确认的交易 |
| 重启本地链后钱包交易卡住或 nonce 异常 | 先重新部署并连接；若钱包仍保留旧链状态，使用钱包的清除活动记录或 nonce 功能，仅处理这个本地测试账户 |

## 8. 本地流程跑通后，再用 Sepolia 协作

线上协作的完整步骤见 [静态网站与 Sepolia 部署](deployment.md)。本地链的数据不会自动同步到 Sepolia。

线上页面：

```text
https://oxidaner.github.io/COMP5565-Decentralized-Apps-Fundamentals-and-Development/
```

管理员在 Sepolia 部署一次合约，再授权制造商、零售商和服务中心。消费者无需角色授权。部署及每笔业务写入由发起交易的钱包支付测试网手续费，公开查询不需要钱包。

部署成功后，设置区域会收起。重新展开 `Connect or deploy the team contract`，`Team link` 下方就是 `Administrator: team roles`。授权组员后，把同一个 `Team link` 发给大家，其他组员连接这份合约即可。

线上初次部署没有演示产品，需要制造商先登记。之后大家可按第 5 节操作，使用自己的 Sepolia 测试钱包地址替换本地账户地址。

本地运行和自动化测试的验收范围见 [验收矩阵](acceptance.md)。本指南提供操作步骤，真实浏览器钱包签名、组员协作和课堂演示仍需实际完成。
