import { useState } from "react";

export function AuthPanel({ auth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (mode === "login") await auth.login(email, password);
    else await auth.register(email, password);
  };

  if (auth.token)
    return (
      <div className="auth-panel">
        <span>Signed in</span>
        <button onClick={auth.logout}>Logout</button>
      </div>
    );

  return (
    <form onSubmit={submit} className="auth-panel">
      <h3>{mode === "login" ? "Login" : "Register"}</h3>
      <input
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        placeholder="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button disabled={auth.loading}>{mode}</button>
      <button
        type="button"
        onClick={() => setMode((m) => (m === "login" ? "register" : "login"))}
      >
        {mode === "login" ? "Need account?" : "Have account?"}
      </button>
      {auth.error && <div className="error">{auth.error}</div>}
    </form>
  );
}
