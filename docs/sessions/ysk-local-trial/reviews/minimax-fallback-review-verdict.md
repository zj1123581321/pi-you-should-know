<!-- delegate-outcome: succeeded -->
# YSK MiniMax fallback 独立审查 verdict

## 范围与总裁决

- 仓库：`pi-you-should-know` 插件仓
- 固定审查范围：`6dbd5f8173ff19c9bafec0dc61ca0178e2eabd93..1d0d4dc58c7777d18a448152031d974628d15566`；远端审查头已确认是 H0 `1d0d4dc58c7777d18a448152031d974628d15566`。
- 风险等级：personal。审查仅读上述 H0 的五个目标文件；没有改实现、测试或文档。
- 总结：发现 4 项 P2、1 项 P3：P2 包含解释失败时提醒可能丢失、错误可诊断性和验收覆盖缺口；P3 是未消费的辅助记录。没有满足本仓 P1 两问的 finding。
- 阻断交付：否。H0 的主路由、常见切换/不切换条件和本地 HTTP producer 契约测试通过；本机检查日志样本未观测到解释失败；本次审查 shell 未设置 herdr 活动变量。P2 项仍须在后续评审中处理或由主脑明确接受，不能把本 verdict 读成「无问题」。

## Findings

### F-01 · P2：解释失败会跳过提醒投递，且下一轮不会重试

**违反 spec 1：未配置 fallback 时须与基线单模型行为完全一致。** 基线在 herdr relay 与本地非 TUI 入队处分别捕获解释请求错误，然后继续发送/入队没有解释的提醒；H0 改成 `forkText()` 在 `stopReason=error` 时抛错。检测阶段已先将身份保存进 `state.seen`，因此解释请求失败会进入外层 `catch`，跳过 `relayToParent()` 或 `notes.push()` / `announce()`。后续同一提醒会按已见身份去重，所谓「下轮检测重试」并不成立。失败行会记成 `outcome=error`，所以不是无日志；但正常用户没有收到提醒，日志也不等于投递。

- herdr relay：`extensions/you-should-know/index.ts:593-600`。若启用了子代理活动环境，失败会使 parent 收不到提醒；本次审查 shell 的 `PI_SUBAGENT_ACTIVITY_FILE` 未设置，未观测到这条路径。
- 本地 note queue：`extensions/you-should-know/index.ts:593-609`。当前配置未启用 fallback；本机 `checks.jsonl` 只有 2 条检查且都为 `none`，没有实测到「检测成功、解释请求失败」事件。若在支持的非 TUI/RPC 路径触发，note 不会入队并会被 `seen` 抑制。
- P1 两问裁决：本机观测窗口内两条检查均未进入提醒/解释失败路径，审查 shell 未设置 herdr 活动变量，第一问没有真实触发证据；若触发，提醒丢失且不会自动重试，后果不理想。提醒属于辅助信息，不是会话源数据；按 personal 风险与本次实测定 P2，不定 P1。OCR 标注 high 不改变此判定。

### F-02 · P2：主/备用真实错误原因没有进入最终检查记录

**违反 spec 3、5：双失败必须保留错误可见性，日志应记录实际 outcome。** 主请求抛异常时，`extensions/you-should-know/index.ts:333-335` 只把原因码传给备用调用，主异常内容未保留。备用返回 `stopReason=error` 时，`index.ts:575` 用固定字符串覆盖 `r.error`；`ysk_fallback_result`（`:319-323`）也只记 outcome/provider/model/usage，不记错误原因。备用抛异常时虽设置 `Error.cause`，最终检查日志通过 `String(err)` 写出包装错误，不会呈现 cause。结果是 `outcome=error` 可见，但操作者无法区分鉴权、限流或传输失败。

双失败测试确实断言了最终 `error` outcome、触发原因及主备 provider/model；OCR 所称「测试只断言包装字符串」不完整。未被测试锁定、且实现确实丢失的是 provider 错误原因本身。保留可诊断的错误类别即可，不需要记录原始响应全文或密钥。

### F-03 · P2：成功的 `ysk_fallback_result` 事件没有测试断言

**违反 spec 5 的可回读日志验收。** 实现会在 `extensions/you-should-know/index.ts:319-323` 写成功结果事件；但 `tests/routing.test.mjs:237-256` 只断言 `ysk_fallback_triggered` 和 check 对象字段，没有读取 `ysk_fallback_result`。删掉结果事件的 `log()` 仍可通过现有断言，因此成功 outcome 与两路 usage 的日志契约没有被测试锁住。代码存在不等于测试验收有约束力；此项是验收覆盖缺口，不是已证实的日志生成错误。

### F-04 · P2：直接抛出的主请求错误分支没有真实覆盖

**违反 spec 2 的请求错误切换验收。** `tests/routing.test.mjs` 中的 `primaryThrow` fixture 会断开 HTTP socket，但其公共断言仍要求 `triggered[0].reason === 'response_error'`（`:242-243`）；这验证的是 Pi 将传输失败映射成 `stopReason=error` 的路径，不是 `modelRegistry` 调用直接 reject 后由 `catch` 走 `request_error` 的路径。备用调用自身直接 reject 的 catch 分支也没有对应 fixture。现有代码在此分支有处理，但 spec 要求的运行时抛错触发条件没有被 producer 测试验证。

### F-05 · P3：两个新增结果/fixture 字段没有消费者

**违反 spec 7 的最小状态不变式。** `tests/routing.test.mjs:53,70` 中的 `sideRequestUrls` 在加入 `sideRoutes` 后只写不读；`extensions/you-should-know/index.ts:326` 的 `primaryResponseOutcome` 被返回但没有被任何调用方读取或写入日志。两处都不影响运行结果，属于低危死数据，建议从后续清理项中删除，不阻断交付。

## 中性输入与其他 OCR 候选的裁决

OCR 主腿首次结果为 `reviewed`（Minimax，coverage complete，14 条候选、14 条已核验）；终端回显被截断后，使用相同 SHA 范围补取完整意见，备腿 envelope 为 `reviewed_fallback`（DeepSeek，coverage complete，16 条已核验：13 确认、2 驳回、1 无法验证）。我逐项复核了完整备腿候选，并按源码另行核对首扫可见但备扫未重复的意见；没有直接照搬 severity。

| 输入 | 本仓裁决 |
|---|---|
| A：解释失败是否是 P1 数据丢失 | 上述 F-01。当前本机样本无触发；后果不理想且不会重试，但按 personal 场景判 P2。herdr 与本地 note queue 分开核过；审查 shell 未设置 herdr 活动变量。 |
| B：成功 `ysk_fallback_result` 未断言 | 是 spec 5 的验收覆盖缺口，P2，见 F-03。实现目前确实写事件。 |
| C：双失败只看包装错误 | provider 真实错误原因确实不可见，违反 spec 3 的「不吞备用错误」，P2，见 F-02。测试还有 outcome 和路线字段断言，故不是「只断言包装字符串」。 |
| 无效 fallback 阻断主路由 | 驳回。`docs/local-trial.md` 明确要求无效备用模型/thinking 在请求前 fail fast；不能按「fallback optional」反向要求忽略非法配置。 |
| abort 可能在 guard 与触发之间插入 | 驳回。`signal.aborted` 检查后同步进入 `useFallback()` 并写 trigger，中间没有异步让出；已启动备用调用会收到同一 signal。 |
| `isFallback` 只按 model id 分类 | 未升为 finding。当前 MiniMax/GPT Luna 模型 id 不同；同 id 场景会使 `primaryRoutes[0]` 断言失败，是假红风险，不会静默假绿。 |
| 嵌套三元、状态文案不一致、对结果对象抽 helper、future scenario 的状态硬编码 | 不列 finding：前两项没有与本次 spec 对应的行为失败，抽 helper 是为未来防漏字段而增加无第二消费者的抽象，硬编码匹配当前唯一启用的 fallback 状态场景。 |
| 解释重写、duplicate/stale 的独立用例缺失 | 记录为低危测试覆盖候选，不另升 P2：检测、解释、重写共用 `fork`/`forkText`；fallback 判定发生在输出解析之前，成功响应才进入 none/格式/去重/过时分支。 |
| 主请求事件等待诊断较弱 | 20 秒外层测试超时会终止等待，问题限于失败诊断，不影响 H0 当前验收；低危测试健壮性候选，不另列 finding。 |

## 验收矩阵与验证

- Spec 1：常规无 fallback 路由保持；解释错误路径存在 F-01。
- Spec 2：`stopReason=error`、成功/none/格式错误/abort/非法配置有实际 RPC fixture 覆盖；直接 reject 分支缺覆盖（F-04）。
- Spec 3：双失败不造成功，check outcome 为 error；provider 错误原因丢失（F-02）。
- Spec 4：检测与解释用本地 HTTP fixture 验证模型/上下文；解释重写没有专门用例。备用调用使用同一完整 context；Claude cache 对齐仍按实际 provider/model 判断。
- Spec 5：触发日志与 `/ysk status` 有断言；成功结果事件没有断言（F-03），provider 错误原因不可见（F-02）。
- Spec 6：真实 Pi RPC + 本地 HTTP producer fixture 断言 URL、model、序列化 thinking 与请求次数；没有调用付费模型。全量测试 35/35 通过。
- Spec 7：未见新增依赖或重试抽象；仅一条 fallback 路径。
- `git diff --check 6dbd5f8173ff19c9bafec0dc61ca0178e2eabd93..1d0d4dc58c7777d18a448152031d974628d15566` 通过。
- CI：派发材料注明主干基线 `gh api request failed`。本次未查询 run/job 级结论；继承红与 CI 新红均未能判定。本地 `npm test` 通过不代表 CI 结论。

## 结构化收尾

- 是否阻断交付：**否**。本次没有 P1；P2 影响可选提醒投递与日志验收，不影响主会话数据，且当前本机观察样本没有触发。F-01 仍违反 spec 1，应由后续评审明确处理或接受。
failure-visibility: p2-only
