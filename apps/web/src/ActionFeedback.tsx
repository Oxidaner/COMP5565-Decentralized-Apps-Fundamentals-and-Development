export type Feedback = {
  kind: "pending" | "success" | "error" | "warning";
  message: string;
  hash?: string;
};

const titles = { pending: "处理中", success: "操作成功", error: "操作未完成", warning: "请注意" };

export default function ActionFeedback({ feedback, label, announce = true }: {
  feedback: Feedback | null; label?: string; announce?: boolean;
}) {
  if (!feedback) return null;
  return (
    <div className={`action-feedback feedback-${feedback.kind}`} role={announce ? feedback.kind === "error" ? "alert" : "status" : undefined} aria-label={announce ? label : undefined} lang="zh-CN">
      <strong>{titles[feedback.kind]}</strong>
      <span>{feedback.message}</span>
      {feedback.hash && <small>交易哈希：<code>{feedback.hash}</code></small>}
    </div>
  );
}
