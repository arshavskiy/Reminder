import { h, type VNodeChild } from "vue";
import { NIcon, useDialog } from "naive-ui";
import { WarningOutline } from "@vicons/ionicons5";

const DIALOG_CLASS = "app-confirm-dialog";

function renderContent(text: string): () => VNodeChild {
  return () => {
    const parts: VNodeChild[] = [];
    const quoted = /"([^"]+)"/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = quoted.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
      parts.push(h("bdi", {class: "confirm-dialog__bidi", dir: "ltr"}, match[1]!));
      lastIndex = quoted.lastIndex;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));

    return h("div", {class: "confirm-dialog__body", dir: "rtl"}, [
      h("p", {class: "confirm-dialog__text"}, parts),
    ]);
  };
}

function renderTitle(title: string, type: "error" | "warning" | "info"): () => VNodeChild {
  return () => h("div", {class: "confirm-dialog__head"}, [
    h("span", {class: ["confirm-dialog__icon", `confirm-dialog__icon--${type}`], "aria-hidden": "true"}, [
      h(NIcon, {component: WarningOutline, size: 22}),
    ]),
    h("span", {class: "confirm-dialog__title-text"}, title),
  ]);
}

function positiveButtonType(type: "error" | "warning" | "info") {
  if (type === "error") return "error" as const;
  if (type === "warning") return "warning" as const;
  return "primary" as const;
}

const buttonDefaults = {
  ghost: false,
  size: "medium" as const,
};

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
      class: DIALOG_CLASS,
      title: renderTitle(title, type),
      content: renderContent(content),
      positiveText: confirmText,
      negativeText: cancelText,
      showIcon: false,
      actionClass: "confirm-dialog__footer",
      positiveButtonProps: {
        ...buttonDefaults,
        type: positiveButtonType(type),
      },
      negativeButtonProps: {
        ...buttonDefaults,
        type: "default",
      },
      onPositiveClick: onConfirm,
    });
  }

  return {confirm};
}
