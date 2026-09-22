import {isRef, onBeforeUnmount, onMounted, type Ref} from "vue";
import {registerDevModal} from "../dev/devModals.js";

type ShowTarget = Ref<boolean> | {show: boolean};

function setShow(target: ShowTarget, value: boolean) {
  if (isRef(target)) target.value = value;
  else target.show = value;
}

export function useDevModal(
  id: string,
  show: ShowTarget,
  opts?: {label?: string; beforeOpen?: () => void},
) {
  if (!import.meta.env.DEV) return;
  let unregister: (() => void) | undefined;
  onMounted(() => {
    unregister = registerDevModal({
      id,
      label: opts?.label ?? id,
      open: () => {
        opts?.beforeOpen?.();
        setShow(show, true);
      },
      close: () => setShow(show, false),
    });
  });
  onBeforeUnmount(() => unregister?.());
}
