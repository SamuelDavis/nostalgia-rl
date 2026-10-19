import { describe, expect, it } from "vitest";
import { type Port, requester, serve } from "./worker";

const channel = (): [Port, Port, ArrayBuffer[][]] => {
  const listeners: [((event: { data: unknown }) => void)[], ((event: { data: unknown }) => void)[]] = [[], []];
  const transfers: ArrayBuffer[][] = [];
  const end = (mine: 0 | 1): Port => ({
    postMessage: (data, transfer) => {
      transfers.push(transfer);
      void Promise.resolve().then(() => listeners[1 - mine]!.forEach((listener) => listener({ data })));
    },
    addEventListener: (_, listener) => listeners[mine]!.push(listener),
  });
  return [end(0), end(1), transfers];
};

describe("worker messaging", () => {
  it("matches replies to requests and transfers response buffers", async () => {
    const [client, worker, transfers] = channel();
    serve<number, Float32Array>(
      worker,
      (n) => new Float32Array(n),
      (response) => [response.buffer as ArrayBuffer],
    );
    const request = requester<number, Float32Array>(client);
    const [a, b] = await Promise.all([request(2), request(5)]);
    expect([a.length, b.length]).toEqual([2, 5]);
    expect(transfers.filter((t) => t.length === 1)).toHaveLength(2);
  });

  it("rejects when the handler throws", async () => {
    const [client, worker] = channel();
    serve<number, number>(worker, () => {
      throw new Error("no such chunk");
    });
    await expect(requester<number, number>(client)(1)).rejects.toThrow(/no such chunk/);
  });
});
