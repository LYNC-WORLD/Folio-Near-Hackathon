import {
  ApiError,
  request,
  setAccountTypeProvider,
  setTokenRefresher,
} from "../client";

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, text: () => Promise.resolve(JSON.stringify(body)) });

const authOf = (call: unknown[]) =>
  (call[1] as { headers: Record<string, string> }).headers.Authorization;

const accountTypeOf = (call: unknown[]) =>
  (call[1] as { headers: Record<string, string> }).headers.account_type;

describe("request 401 retry", () => {
  const fetchMock = jest.fn();
  let unregister: () => void = () => {};
  let unregisterAccountType: () => void = () => {};
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    unregister();
    unregisterAccountType();
  });

  it("refreshes the token once and retries", async () => {
    fetchMock.mockReturnValueOnce(reply(401, {})).mockReturnValueOnce(reply(200, { ok: 1 }));
    const refresher = jest.fn().mockResolvedValue("new");
    unregister = setTokenRefresher(refresher);

    await expect(request("/x", { token: "old" })).resolves.toEqual({ ok: 1 });
    expect(refresher).toHaveBeenCalledWith("old");
    expect(authOf(fetchMock.mock.calls[1])).toBe("Bearer new");
  });

  it("gives up when no fresh token comes back", async () => {
    fetchMock.mockReturnValue(reply(401, { message: "expired" }));
    unregister = setTokenRefresher(jest.fn().mockResolvedValue(null));

    await expect(request("/x", { token: "old" })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry other errors", async () => {
    fetchMock.mockReturnValue(reply(500, {}));
    const refresher = jest.fn();
    unregister = setTokenRefresher(refresher);

    await expect(request("/x", { token: "old" })).rejects.toBeInstanceOf(ApiError);
    expect(refresher).not.toHaveBeenCalled();
  });

  it("sends the backend account type for each provider", async () => {
    fetchMock.mockReturnValue(reply(200, {}));

    await request("/google", { account_type: "google" });
    await request("/apple", { account_type: "apple" });

    expect(accountTypeOf(fetchMock.mock.calls[0])).toBe("google");
    expect(accountTypeOf(fetchMock.mock.calls[1])).toBe("apple");
  });

  it("uses the provider registered by AuthProvider when omitted", async () => {
    fetchMock.mockReturnValue(reply(200, {}));
    unregisterAccountType = setAccountTypeProvider(() => "apple");

    await request("/from-context");

    expect(accountTypeOf(fetchMock.mock.calls[0])).toBe("apple");
  });

  it("prefers an explicit account type over the registered provider", async () => {
    fetchMock.mockReturnValue(reply(200, {}));
    unregisterAccountType = setAccountTypeProvider(() => "apple");

    await request("/explicit", { account_type: "google" });

    expect(accountTypeOf(fetchMock.mock.calls[0])).toBe("google");
  });
});
