export interface Port {
  postMessage(message: unknown, transfer: ArrayBuffer[]): void;
  addEventListener(type: "message", listener: (event: { readonly data: unknown }) => void): void;
}

interface Request<Q> {
  readonly id: number;
  readonly request: Q;
}

type Reply<R> = { readonly id: number; readonly response: R } | { readonly id: number; readonly error: string };

export const serve = <Q, R>(
  port: Port,
  handle: (request: Q) => R,
  transfer: (response: R) => ArrayBuffer[] = () => [],
) =>
  port.addEventListener("message", ({ data }) => {
    const { id, request } = data as Request<Q>;
    try {
      const response = handle(request);
      port.postMessage({ id, response } satisfies Reply<R>, transfer(response));
    } catch (error) {
      port.postMessage({ id, error: String(error) } satisfies Reply<R>, []);
    }
  });

export const requester = <Q, R>(port: Port): ((request: Q) => Promise<R>) => {
  const pending = new Map<number, { resolve: (response: R) => void; reject: (error: Error) => void }>();
  let nextId = 0;
  port.addEventListener("message", ({ data }) => {
    const reply = data as Reply<R>;
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    if ("error" in reply) waiting.reject(new Error(reply.error));
    else waiting.resolve(reply.response);
  });
  return (request) =>
    new Promise<R>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      port.postMessage({ id, request } satisfies Request<Q>, []);
    });
};
