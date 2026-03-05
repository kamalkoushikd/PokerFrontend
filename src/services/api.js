export const API_URL = "http://localhost:8000/api";

export const login = async (username, password, totp_code = undefined) => {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, totp_code }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail?.error || "Login failed");
  }
  return res.json();
};

export const googleAuth = async (accessToken) => {
  const res = await fetch(`${API_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ google_access_token: accessToken }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail?.error || "Google auth failed");
  }
  return res.json();
};

export const setup2FA = async (totp_code, token) => {
  const res = await fetch(`${API_URL}/auth/setup-2fa`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ totp_code }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail?.error || "Setup failed");
  }
  return res.json();
};

export const adminCreateUser = async (username, password, token) => {
  const res = await fetch(`${API_URL}/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail?.error || "Create user failed");
  }
  return res.json();
};

export const getAllowedEmails = async (token) => {
  const res = await fetch(`${API_URL}/admin/allowed-emails`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch emails");
  return res.json();
};

export const addAllowedEmail = async (email, token) => {
  const res = await fetch(`${API_URL}/admin/allowed-emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail?.error || "Failed to add email");
  }
  return res.json();
};

export const removeAllowedEmail = async (id, token) => {
  const res = await fetch(`${API_URL}/admin/allowed-emails/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to remove email");
  return res.json();
};
