# MiniMax 主用与 GPT Luna 单次备用进度

## 2026-10-08 — 实现与 producer 验证

- **阶段**：implementing；实现、测试与说明完成，待插件主脑独立审查。
- **本段结论**：在现有 `config.json` 中新增可选顶层 `fallback` 对象；对检测、解释与解释重写共用的模型调用只增加一条顺序路径：主请求返回 `stopReason=error` 或请求调用抛错时，signal 未取消才调用备用一次。无备用仍走原单模型路径；成功、`learn: none`、不可解析输出与 signal abort 不切换；主/备用错误不会变成虚构成功或 none。
- **关键决策**：备用从 `fallback.model` 单独解析、`fallback.thinking` 不继承主 family thinking。保留 `YSK_MODEL`、顶层配置与 GPT/Fable family 的主模型兼容顺序。缓存对齐继续以实际 provider/model 和未显式 thinking 为门槛。未增加重试抽象、依赖或持久状态。备用触发和最终响应使用 `ysk_fallback_triggered` / `ysk_fallback_result` 结构化事件；check entry 保留可用的两路 usage 与最后 outcome，错误码不记录备用原始响应。
- **已否决方案**：不在主响应成功但输出格式不合规、`learn: none` 或用户取消时试备用；不重试主模型；不把备用 thinking 继承为 family 的 `high`；不记录 request/prompt/完整 response。
- **验证**：有效 base 红验 `node --test --test-name-pattern='MiniMax failure uses GPT Luna once for detection and explanation' tests/routing.test.mjs` 在源码未实现时真实启动 Pi RPC 与 MiniMax HTTP fixture，断言应为 `shown`，实际是 `outcome=error` 且只有主 provider 请求。修复后同命令通过。`npm test` 全量通过 35 项，`git diff --check` 通过。fixture 实际断言主/备用 provider URL、model、序列化 reasoning、fallback 最多一次、检测/解释上下文和配置热读取、status、直接成功、none、不可解析输出、abort、双失败及非法备用配置；没有真实模型调用。
- **Producer 边界说明**：fixture 断开 MiniMax HTTP 连接时，Pi 将底层请求异常映射为 `stopReason=error`，因此该测试验证 producer 的 error-response 路径，未单独制造 Pi API 调用直接抛出的拒绝；生产代码仍在主 `call()` 的显式 catch 中处理 `request_error` 并以固定原因码切换。测试里的 abort 使用 RPC `new_session` 触发插件 `session_start` abort；为让旧检查完成可观测收尾，debug 通知捕获启动时 UI 引用，避免 session 替换后访问旧 ctx。
- **提交**：红验测试 `53951e0 test: cover YSK MiniMax single fallback routing`；实现与 producer fixture `b664739 feat: add one-shot YSK fallback routing`。
- **下一步唯一动作**：交插件主脑独立审查；本卡不安装、不改家目录配置、不做真实模型烟测、不发上游 issue/PR。
