# YSK 本机试用记录：通用旁路模型与中文去重

## 目的与范围

这是用户 fork 的本机试用改动，不是上游发布。改动包括：中文提醒身份去重；在现有 `config.json` 里用一个通用 `model` / `thinking` 选择旁路模型；让检测与解释遵从主会话明确的语言要求，同时保留高提醒门槛。

配置读取位置为 `${PI_CODING_AGENT_DIR:-~/.pi/agent}/you-should-know/config.json`。前一轮本机试用建议值：

```json
{
  "model": "openai/gpt-6.1-sol",
  "thinking": "high"
}
```

模型选择顺序：`YSK_MODEL` 环境变量 > 顶层 `model` > 既有 GPT/Fable family route > 当前主模型。thinking 顺序：显式顶层 `thinking` > 既有 family thinking > 原先的 undefined 行为；`YSK_MODEL` 只覆盖模型，不覆盖 thinking。family 旧配置、无新字段默认以及同模型 Claude 的 cache 对齐路径保留。显式格式错误、未注册模型或非法 thinking 会通过现有检查日志/UI 错误可见，不切回主模型。检测和解释各自重新读取配置，`/ysk status` 报告有效 provider/model/thinking。

Unicode 身份规则使用 NFKC、Unicode 小写和 Unicode 字母/数字/组合标记，最后按非字母数字边界折叠空格。这样既保留不同中文提醒，也让全角 `ＡＰＩ` 与 `API` 采用相同身份；seen 与 known 反馈沿用同一个 `norm`。没有空 key 哈希回退。

提示词按主会话明确语言输出；没有明确偏好时用主会话主要语言，完全不明确时英语仍为默认。固定机读标签 `learn` / `tag` / `evidence` / `explain` 与 tag 值保持不变。有效提醒仍须有实际后果、相关于用户目标、没有充分覆盖，并且用户确实未知/不确定；不确定时输出 `learn: none`，不生成总结或科普提醒。语言裁决：主脑裁定交接指令“服从会话语言”为上位 spec；卡面“无明确偏好保持英语默认可以”是许可级从句，因此三层规则为“明确要求 > 会话主语言 > 无从判断时英语”。

## MiniMax 主用与 GPT Luna 单次备用

当前 fork 可在同一配置文件中指定主模型与一个可选备用模型：

```json
{
  "model": "minimax-cn/MiniMax-M3.1-Flash-Preview",
  "thinking": "off",
  "fallback": {
    "model": "openai/gpt-6-luna",
    "thinking": "off"
  }
}
```

只有主请求 `stopReason=error` 或主模型调用抛出请求错误时，才向备用发送一次相同会话上下文及该请求的安全提示；不重试主模型。主模型正常完成、返回 `learn: none`、输出不可解析、用户取消请求时不调备用。备用请求沿用它自己的 `thinking`，不被主模型的 family 配置覆盖。无 `fallback` 的旧单模型配置路径保持原样；无效备用模型或 thinking 在发出模型请求前报错。

`/ysk status` 同时显示主/备用 provider、model 和 thinking。`checks.jsonl` 中 `ysk_fallback_triggered` 用固定原因码标记切换，并记录两侧 provider/model；`ysk_fallback_result` 记录最终响应 outcome 及可用 usage，check entry 可区分主模型直成与备用成功。日志不写请求 prompt、完整 payload、完整响应或凭据。Pi + 本机 HTTP producer fixture 检查实际 provider URL、model 与序列化 thinking 字段；它不证明真实 MiniMax/GPT Luna 的 thinking 能力、输出质量或提醒有增量价值，仍未执行真实模型烟测。

## 验证

- Unicode base 红验：`node --test --test-name-pattern='different Chinese notes keep distinct identities' tests/notes.test.mjs`，基线断言失败：期望两条不同中文提醒送达，实际只送达 1 条（`1 !== 2`）。这是有效生产行为失败，不是导入/语法失败。
- Unicode 修复绿验：同一命令通过；生产路径日志顺序为 `shown, shown, deduped, shown, shown, deduped, shown, deduped`，覆盖纯中文、相同 Latin 标识符下不同中文含义、中文标点重复、NFKC 全角/半角身份、英文大小写/标点契约，以及 Knew 反馈身份。
- 空身份符号红绿验：符号版生产用例在修复前因提醒互吞而出现 `2 !== 3`，修复后 outcome 为 `shown, shown, shown`；同时加载空规范化 known 反馈时不会将其作为已知身份。
- Pi + HTTP producer fixture：`tests/routing.test.mjs` 启动真实 Pi RPC 与本机 HTTP server，检查实际请求体 model、reasoning 和 provider URL。GLM 主模型使用顶层 OpenAI 路由；检测与解释两条请求均被断言。检测后 fixture 改写 config，解释请求读到新的 thinking。另有 `YSK_MODEL` 优先级、`/ysk status`、旧 family 路由、非法配置和无回退断言。
- 提示词断言检查 detector 与 explanation request 含语言规则和固定解析标签，detector 仍含四项高门槛及非总结约束。
- 全量验证：`npm test`，25 项通过、0 项失败，最终运行耗时 3.97 秒。执行器提交前再次完成全量验证。

全部模型协议测试使用本机 HTTP fixture，不调用付费模型；因此这不等价于真实 provider 的本机烟测，也不证明提示的实际增量价值。

## 来源、提交与安装

- 源码来源：用户 fork `zj1123581321/pi-you-should-know`，卡分支 `card/ysk-local-improvements`；未改主 checkout，未向 `aliceisjustplaying/pi-you-should-know` 发 issue/PR。
- Unicode 实现提交：`e1ef7704e841848e0cdc59bf248d215034af904f`。
- 通用模型配置、提示词及 HTTP producer fixture 提交：`ec4ead48b894ca82f010aac87902e84af03e570b`。
- 本机路径安装说明为 `pi install "$HOME/projects/oss/pi-you-should-know"`，通过 `$HOME` 指向主 checkout 而不是临时 worktree；该命令未执行，没有实际安装、真实模型烟测或部署。
- 保留上游项目来源说明与 package 现状：没有加/改许可证，`package.json` 仍标记 `UNLICENSED`。
- 独立审查尚待主脑完成；用户决定前不建 draft PR。

## 残留风险与撤销

- fixture 锁定序列化与实际 RPC producer，但真实 provider 对 `gpt-6.1-sol` 的可用性、thinking 能力、真实中文提醒质量仍须本机人工试用确认；测试全绿不代表提醒有增量价值。
- 通用模型会接收当前对话上下文；换用不同 provider 可能产生额外费用，且不能假设共享 Claude cache。
- 不执行安装。需要撤销时在本机 fork 分支分别回退以上两个实现提交；试用配置保持在用户自己的 Pi 配置路径，不由仓库写入或自动安装。
