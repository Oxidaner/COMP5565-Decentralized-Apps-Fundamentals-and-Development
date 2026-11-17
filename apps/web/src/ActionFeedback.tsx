export type Feedback = {
  kind: "pending" | "success" | "error" | "warning";
  message: string;
  hash?: string;
};

const titles = { pending: "Processing", success: "Success", error: "Not completed", warning: "Needs attention" };

export default function ActionFeedback({ feedback, label, announce = true }: {
  feedback: Feedback | null; label?: string; announce?: boolean;
}) {
  if (!feedback) return null;
  return (
    <div className={`action-feedback feedback-${feedback.kind}`} role={announce ? feedback.kind === "error" ? "alert" : "status" : undefined} aria-label={announce ? label : undefined}>
      <strong>{titles[feedback.kind]}</strong>
      <span>{feedback.message}</span>
      {feedback.hash && <small>Transaction hash: <code>{feedback.hash}</code></small>}
    </div>
  );
}
