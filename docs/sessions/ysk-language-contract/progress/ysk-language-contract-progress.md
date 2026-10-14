# ysk-language-contract 进度

## 2026-10-14 契约落入 detect/explain 与 Unicode 去重

### 当前阶段
implementing

### 本段结论
`language` 校验 fail-fast；配置后 detect/explain 写入 schema 硬约束，未配置写入跟随对话指令。CJK 有无检测 + 独立小请求修复一次，仍违约记 `language_rejected` 丢单。`norm()` 改 NFKC + Unicode 字母数字，空身份跳过去重。

### 关键决策与已否决方案
修复记在该次 check 的 `repair` 字段（usage/ms），不用独立 event。检测函数留在 index.ts 顶层。卡面未列的 `plain-English` / `Plain English` 一并中立化。

### 下一步唯一动作
补 E2E/单元锁（修复成功、丢单、混排、去重、非法 language）并写入 README。
