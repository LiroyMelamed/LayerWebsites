import * as React from "react";
import { Toast } from "@base-ui/react/toast";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

export type ToastType = "success" | "error" | "warning" | "info";

export type AppToastData = {
  type?: ToastType;
};

/** Global toast manager — usable outside React (API helpers, form saves). */
export const toastManager = Toast.createToastManager();

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />,
  error: <AlertCircle className="h-5 w-5 text-red-600" aria-hidden />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />,
  info: <Info className="h-5 w-5 text-blue-600" aria-hidden />,
};

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return (
    <>
      {toasts.map((toast) => {
        const type = ((toast.data as AppToastData | undefined)?.type
          || (toast as { type?: ToastType }).type
          || "info") as ToastType;
        return (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className={cn("lw-toast-root")}
            data-type={type}
          >
            <div className="mt-0.5">{ICONS[type] || ICONS.info}</div>
            <Toast.Content className="min-w-0">
              {toast.title ? (
                <Toast.Title className="lw-toast-title">{toast.title}</Toast.Title>
              ) : null}
              {toast.description ? (
                <Toast.Description className="lw-toast-description">
                  {toast.description}
                </Toast.Description>
              ) : null}
            </Toast.Content>
            <Toast.Close className="lw-toast-close" aria-label="Close">
              <X className="h-4 w-4" />
            </Toast.Close>
          </Toast.Root>
        );
      })}
    </>
  );
}

export type ToastProviderProps = {
  children: React.ReactNode;
  /** Visual stack placement. Default top-center. */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "top-center";
  timeout?: number;
  limit?: number;
};

/**
 * App-wide toast host. Pass `position` for viewport placement.
 * Prefer `toastManager.add({ title, description, type })` from anywhere.
 */
export function ToastProvider({
  children,
  position = "top-center",
  timeout = 5000,
  limit = 4,
}: ToastProviderProps) {
  return (
    <Toast.Provider toastManager={toastManager} timeout={timeout} limit={limit}>
      {children}
      <Toast.Portal>
        <Toast.Viewport
          className="lw-toast-viewport"
          data-position={position}
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

/** Convenience helpers matching product call sites. */
export function toast(opts: {
  title?: string;
  description?: string;
  type?: ToastType;
  timeout?: number;
}) {
  const { type = "info", title, description, timeout } = opts || {};
  return toastManager.add({
    title,
    description,
    timeout,
    data: { type },
  });
}

export function toastError(title: string, description?: string) {
  return toast({ title, description, type: "error" });
}

export function toastSuccess(title: string, description?: string) {
  return toast({ title, description, type: "success" });
}

export function toastWarning(title: string, description?: string) {
  return toast({ title, description, type: "warning" });
}

export function toastInfo(title: string, description?: string) {
  return toast({ title, description, type: "info" });
}
