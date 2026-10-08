# YSK local improvements 进度

## 里程碑 1：Unicode 去重

- 当前阶段：Unicode 生产规则已修复并单独提交。
- 本段结论：NFKC 规范化并保留 Unicode 字母、数字和组合标记；两条不同中文提醒、相同 Latin 标识符下不同中文含义、兼容形式和英文大小写/标点去重均由生产路径测试覆盖。base 红验曾以中文第二条提醒被吞而失败，修复后通过。
- 关键决策与已否决方案：seen 与 known 继续调用同一个 `norm`；未采用空 key 哈希/回退，因为这会把身份错误隐藏起来。测试环境显式指向临时 Pi 目录，避免使用真实家目录状态。
- 下一步唯一动作：在同一分支实现顶层通用 model/thinking 配置，并用真实 Pi RPC + 本机 HTTP fixture 锁定实际 provider 请求。
- 提交：`e1ef770 fix: preserve Unicode note identities`

## 里程碑 2：通用路由与语言提示

- 当前阶段：实现与协议 fixture 验证完成，代码提交已建立，待补齐试用文档后推送。
- 本段结论：实现 model 优先级 `YSK_MODEL > 顶层 model > family route > 主模型`，thinking 优先级 `顶层 thinking > family thinking > 原行为`；检测与解释分别发出的 Pi provider HTTP 请求均验证了实际 model、reasoning 和 provider 路径。配置在解释请求前变更后，下一次请求读取到了新 thinking。`/ysk status` 的选中值、非法配置 fail-loud、旧 family 路由与 Claude cache 对齐也有测试。
- 关键决策与已否决方案：配置继续放在现有 `config.json`，没有加 fallback、重试、第二配置文件或新的抽象；说明提示将当前会话语言置于默认英语之上，保留机读标签和高提醒门槛。实际模型烟测与安装不执行，以免越过本机试用授权边界。
- 下一步唯一动作：写完试用记录和剩余风险，跑最终 `npm test` 与差异审查后推送本卡分支。
- 提交：`620badc feat: configure general YSK side model`

## 里程碑 3：完成提交与验收

- 当前阶段：实现、文档与测试完成；等待主脑独立复核。
- 本段结论：`npm test` 全量 24 项通过；路由 fixture 使用真实 Pi RPC、真实 provider 序列化和本机 HTTP server，不调用付费模型。没有运行安装或真实 provider 烟测，提醒的真实增量价值仍待本机试用。
- 关键决策与已否决方案：README 的 local-trial 示例采用本机 ready 的 `openai/gpt-6.1-sol` + `high`，安装路径指向主 checkout；不建 draft PR、不触碰上游、不安装、不发布。
- 下一步唯一动作：由主脑对已推送卡分支做独立复核，并决定后续本机安装/试用；本卡执行器不安装。
- 最终实现提交：`620badc feat: configure general YSK side model`
