import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ApiError, errorMessage } from '../api/client';

export function notifySuccess(message: string, title = 'Done') {
  notifications.show({ color: 'teal', title, message });
}

export function notifyError(err: unknown, title = 'Something went wrong') {
  const code = err instanceof ApiError ? ` (${err.code})` : '';
  notifications.show({ color: 'red', title, message: `${errorMessage(err)}${code}` });
}

interface ApiMutationOptions<TVars, TData> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** Success toast text (string or derived from the result). Omit for no toast. */
  success?: string | ((data: TData, vars: TVars) => string);
  /** Query keys to invalidate after success. */
  invalidate?: QueryKey[];
  onSuccess?: (data: TData, vars: TVars) => void;
  /** Optional friendlier text for specific errors (return undefined to use the server message). */
  errorText?: (err: unknown) => string | undefined;
}

/** useMutation + notifications + cache invalidation, used by every write in the panel. */
export function useApiMutation<TVars = void, TData = unknown>(opts: ApiMutationOptions<TVars, TData>) {
  const qc = useQueryClient();
  return useMutation<TData, unknown, TVars>({
    mutationFn: opts.mutationFn,
    onSuccess: async (data, vars) => {
      if (opts.success) {
        notifySuccess(typeof opts.success === 'function' ? opts.success(data, vars) : opts.success);
      }
      opts.onSuccess?.(data, vars);
      if (opts.invalidate) {
        await Promise.all(opts.invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
      }
    },
    onError: (err) => {
      const text = opts.errorText?.(err);
      notifyError(text ? new Error(text) : err);
    },
  });
}
