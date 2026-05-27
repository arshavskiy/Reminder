import { useDialog } from "naive-ui";

export function useConfirm() {
  const dialog = useDialog();

  function confirm({
    title,
    content,
    confirmText = "אישור",
    cancelText = "ביטול",
    type = "error" as "error" | "warning" | "info",
    onConfirm,
  }: {
    title: string;
    content: string;
    confirmText?: string;
    cancelText?: string;
    type?: "error" | "warning" | "info";
    onConfirm: () => void | Promise<void>;
  }) {
    dialog[type]({
      title,
      content,
      positiveText: confirmText,
      negativeText: cancelText,
      onPositiveClick: onConfirm,
    });
  }

  return { confirm };
}
