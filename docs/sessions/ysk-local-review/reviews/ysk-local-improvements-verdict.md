# YSK 本机试用改进独立审查 verdict
failure-visibility: p2-only

<!-- delegate-outcome: succeeded -->

## 结论

**阻断本轮验收。** 只有一条 P2：提示词和试用文档在“没有明确语言偏好”时采用主会话主要语言，违反 spec #3 要求的英语默认。检测高门槛、旁路路由、Unicode 身份规则及其他验收项均通过；修正默认语言契约并补锁测试后可重新验收。该阻断来自本轮明确验收条件，不代表 P1 风险。

## 审查范围与现场

- 固定范围：`4ffe3daec322de069bd15e174f23b6d4a5c45419..0d3db2a47fd92d4b34b9eed6ada31162e03bac9b`；审查时 HEAD 为 H0 `0d3db2a47fd92d4b34b9eed6ada31162e03bac9b`。
- 在独立工作树 `card/ysk-local-review` 上按卡面执行 `git merge --ff-only 0d3db2a47fd92d4b34b9eed6ada31162e03bac9b`；工作区在审查开始前干净。H0 范围共 7 个文件，未修改任何被审源码、测试、文档或 `package.json`。
- `Task-Id` 与 `Fixes-Issue` 在卡面留空，未自行补造。主干基线不可用（卡面记录 `gh api request failed`）；本仓没有 CI，继承红与新 CI 红无法判定。下面的 base 红验是定向测试验证，不是 CI 红。

## Findings

### P2 — 未明确指定语言时没有英语默认

- **违反 spec：** #3，要求服从主会话明确指定的语言；没有明确偏好时保持英语默认。
- **证据：** `extensions/you-should-know/detect-prompt.md:13` 写明否则匹配主会话主要语言；`docs/local-trial.md:20` 又将“没有明确偏好”定义为使用主会话主要语言。`tests/routing.test.mjs:160-163` 只断言请求含有“遵从明确语言”的提示及四道门槛、机读标签，没有断言无偏好时要求英语。
- **触发与影响：** 主会话主要语言为中文、但用户没有明确指定输出语言时，提示会要求中文；这与本卡要求的英语默认相反。
- **建议修法：** 将规则写成“用户明确指定语言时遵从；否则使用英语”，同步试用记录；在真实 Pi RPC producer fixture 捕获的检测和解释请求中断言这两个分支的规则均存在。
- **阻断判断：** 阻断本轮验收，因为默认分支是 spec 明确要求的行为且尚未由实现满足；严重度仍为 P2。

## Spec 逐条核对

1. **Unicode 去重：通过。** 生产 `norm` 在 `extensions/you-should-know/index.ts:155` 使用 NFKC、小写和 `\p{L}\p{N}\p{M}`；seen 与 known 均经该规则。`tests/notes.test.mjs:67-110` 经检测流程覆盖不同中文、相同 Latin 标识下不同中文、中文标点重复、全角兼容形式、英文大小写/标点，以及 Knew 反馈身份。无空 key 哈希回退。
2. **顶层 `model` / `thinking`：通过。** `index.ts:179-204` 落在既有 `pickModel`：环境变量 > 顶层 model > family route > 主模型；thinking 为顶层 > family > undefined。`tests/routing.test.mjs:15-28,135-170` 覆盖实际请求及非法值；“other Claude”用例检查相同模型的工具、system payload 与 cache alignment。
3. **提示词语言与门槛：部分不通过。** 四道门槛、`learn: none`、总结限制、机读标签和 tag 值均保留；唯一 finding 是英语默认被改成主会话语言默认，见上。
4. **生产边界测试：通过。** routing fixture 启动 Pi RPC 子进程并接本机 HTTP server；实际收到的检测/解释 payload 检查 model、reasoning 和 provider URL，配置在检测后变更也影响解释请求。中文反例走生产 `norm` 与检测路径，能在 base 转红。
5. **README：通过。** 示例为 `openai/gpt-6.1-sol` + `high`；安装路径指向 `$HOME/projects/oss/pi-you-should-know`；保留上游署名，`package.json` 的 `UNLICENSED` 未改。
6. **反熵：通过。** 未加依赖、配置文件、生产抽象或新运行时状态；只改既有 `norm`、`pickModel` 和现有 fixture，未改 `package.json`。
7. **验证入口：通过。** `npm test` 在当前树运行 24 项全通过，0 失败，耗时约 4.48 秒；测试使用临时 Pi 配置目录和本机 fixture，不调用付费模型。

## 红验抽查

使用 `scripts/git/scratch-worktree.sh` 在 base 建临时树，每次只拷入对应新增测试文件，运行后临时树自动移除。以下命令中的 `$REPO_ROOT` 指当前仓 checkout，`$AGENT_CONFIG_ROOT` 指 agent-config checkout；执行时均已导出。

1. 命令：

   ```sh
   "$AGENT_CONFIG_ROOT/scripts/git/scratch-worktree.sh" "$REPO_ROOT" 4ffe3daec322de069bd15e174f23b6d4a5c45419 -- bash -lc 'cp "$REPO_ROOT/tests/notes.test.mjs" tests/notes.test.mjs && node --test --test-name-pattern="different Chinese notes keep distinct identities while repeats are suppressed" tests/notes.test.mjs'
   ```

   结果：按预期退出 1；base 的 `norm` 只产生 3 条通知，测试期望 5 条（断言 `3 !== 5`）。

2. 命令：

   ```sh
   "$AGENT_CONFIG_ROOT/scripts/git/scratch-worktree.sh" "$REPO_ROOT" 4ffe3daec322de069bd15e174f23b6d4a5c45419 -- bash -lc 'cp "$REPO_ROOT/tests/routing.test.mjs" tests/routing.test.mjs && node --test --test-name-pattern="global config routes a GLM main model through OpenAI for detection and explanation" tests/routing.test.mjs'
   ```

   结果：按预期退出 1；base 实际使用 `glm-5`，测试期望配置的 `gpt-6.1-sol`。两项均在目标断言处失败，不是导入或语法失败。

## OCR、验证与 Backlog

- `ocr-review`：`status=reviewed_fallback`、`coverage=complete`、备份 profile `deepseek` / model `deepseek-v4-flash`、`findings=[]`。主腿诊断为 `primary_marker_active(primary_failed_unclassified)`；备份腿成功。`verify=skipped` 是因为没有 OCR finding 需要验证，不将其记作另一次完整验证。独立发现的 P2 是按本卡 spec 复核所得。
- `git diff --check` 报 detect-prompt 新增/变更行 19、111、137 有尾随空格。卡面没有对应格式条款，不作为 finding；可顺手清理。未发现其他需要记入 backlog 的存量问题。
- 继承 CI 红 / 新 CI 红：主干基线不可用且仓内无 CI，**未能判定**。本地 `npm test` 的结果如上。

## 踩到的坑

pickup 简报确认本工作区无交接单，也没有接手锚点；未用其他会话的交接单替代。完整巡检原文保存在私有执行报告中；本 verdict 不记录本机绝对路径。

项目专属 memory 索引和 graphify 图谱不存在；ctx 历史检索仅找到一条规划卡摘要，没有用作实现证据。派发 ID 与本任务一致，故本工作树没有被判作他人占用。

## 闸与绕过

- 按固定 SHA 快进后审查；未按分支名扩展范围。
- OCR 主腿失败后由包装器走备份腿，按真实 `reviewed_fallback` 记录；没有把 fallback 写成 clean。
- 红验通过 scratch-worktree helper 执行并自动清理；生产树只新增本 verdict 文件。
- `git diff --check` 的尾空格结果仅记录，不越界修被审文件。

## 与卡面的偏差

未发现执行范围偏差。卡面的 `Task-Id`、`Fixes-Issue` 为空；主干基线不可用，继承 CI 红未能判定。唯一审查结论偏差是上述语言默认 finding：它违反 spec #3，建议修复后再验收。

## 最贵的一步

OCR 主腿不可用，完整备份扫描约 196 秒；随后两项 base 红验各约半秒，`npm test` 约 4.48 秒。
