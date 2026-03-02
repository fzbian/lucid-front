import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login, isAuthenticated, getUsers } from "../auth";
import useTitle from "../useTitle";
import useTimeout from "../useTimeout";
import ServerDown from "../components/ServerDown";
import { useRole } from "../context/RoleContext";

function validateLoginForm({ username, pin, users, loadingUsers }) {
  const errors = {};

  if (loadingUsers) {
    errors.users = "Estamos cargando los usuarios, espera un momento.";
  } else if (!users.length) {
    errors.users = "No hay usuarios disponibles para iniciar sesión.";
  }

  if (!String(username || "").trim()) {
    errors.username = "Selecciona un usuario.";
  }

  const safePin = String(pin || "").trim();
  if (!safePin) {
    errors.pin = "Ingresa tu PIN.";
  } else if (!/^\d+$/.test(safePin)) {
    errors.pin = "El PIN solo permite números.";
  } else if (safePin.length < 4 || safePin.length > 8) {
    errors.pin = "El PIN debe tener entre 4 y 8 dígitos.";
  }

  return errors;
}

export default function Login() {
  const navigate = useNavigate();
  useTitle("Ingresar · ATM Ricky Rich");
  const { reloadConfig } = useRole();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [usersError, setUsersError] = useState("");
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [touched, setTouched] = useState({ username: false, pin: false });
  const [submitted, setSubmitted] = useState(false);
  const location = useLocation();
  const timedOutUsers = useTimeout(loadingUsers, 10000);
  const errors = validateLoginForm({ username, pin, users, loadingUsers });
  const showUsernameError = (submitted || touched.username) && !!errors.username;
  const showPinError = (submitted || touched.pin) && !!errors.pin;
  const disableSubmit = loading || !!errors.users || !!errors.username || !!errors.pin;

  useEffect(() => {
    // Si ya autenticado, ir a la ruta por defecto segun permisos.
    if (isAuthenticated()) navigate("/", { replace: true });
    // Cargar lista de usuarios desde users.json
    (async () => {
      try {
        const list = await getUsers();
        setUsers(list);
        setUsername((prev) => {
          if (!list.length) return "";
          if (prev && list.some((u) => u.username === prev)) return prev;
          return list[0].username;
        });
        setUsersError("");
      } catch (e) {
        setUsersError("No se pudieron cargar los usuarios. Verifica la conexión e inténtalo de nuevo.");
      } finally {
        setLoadingUsers(false);
      }
    })();
  }, [navigate]);

  const reloadUsers = async () => {
    setUsersError("");
    setFormError("");
    setLoadingUsers(true);
    try {
      const list = await getUsers(true);
      setUsers(list);
      setUsername((prev) => {
        if (!list.length) return "";
        if (prev && list.some((u) => u.username === prev)) return prev;
        return list[0].username;
      });
    } catch (e) {
      setUsersError("No se pudieron cargar los usuarios. Verifica la conexión e inténtalo de nuevo.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setSubmitted(true);
    setFormError("");

    const nextErrors = validateLoginForm({ username, pin, users, loadingUsers });
    if (nextErrors.users || nextErrors.username || nextErrors.pin) return;

    setLoading(true);
    try {
      await login(username.trim(), pin.trim());
      await reloadConfig(); // Force role reload from session
      const dest = location.state?.from?.pathname || "/";
      navigate(dest, { replace: true });
    } catch (err) {
      setFormError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  if (loadingUsers && timedOutUsers) {
    return (
      <div className="min-h-screen bg-[var(--background-color)] text-[var(--text-color)] flex items-center justify-center p-6">
        <ServerDown onRetry={reloadUsers} />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--background-color)] text-[var(--text-color)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-20 h-72 w-72 rounded-full bg-[var(--primary-color)]/25 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-6 sm:px-6">
        <div className="w-full overflow-hidden rounded-3xl border border-white/10 bg-[var(--card-color)]/90 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="grid lg:grid-cols-[1.1fr_1fr]">
            <section className="p-5 sm:p-8 lg:p-10">
              <div className="mb-6 flex items-center gap-3">
                <img src={process.env.PUBLIC_URL + "/logo.png"} alt="ATM Ricky Rich" className="h-12 w-12 rounded-xl border border-white/15 bg-black/30 object-contain p-1.5" />
                <div>
                  <h1 className="text-xl font-bold leading-tight sm:text-2xl">Iniciar sesión</h1>
                  <p className="text-xs text-[var(--text-secondary-color)] sm:text-sm">Accede con tu usuario y PIN</p>
                </div>
              </div>

              <form onSubmit={onSubmit} noValidate className="space-y-4">
                <div>
                  <label htmlFor="login-username" className="mb-1 block text-xs font-medium text-[var(--text-secondary-color)]">Usuario</label>
                  <div className="relative flex items-center gap-2 rounded-xl bg-[var(--dark-color)] px-3">
                    <span className="material-symbols-outlined text-[var(--text-secondary-color)]" aria-hidden>person</span>
                    {loadingUsers ? (
                      <div className="w-full py-3 text-sm text-[var(--text-secondary-color)] animate-pulse">Cargando usuarios...</div>
                    ) : users.length ? (
                      <>
                        <select
                          id="login-username"
                          className="no-caret w-full bg-transparent py-3 pr-8 text-sm outline-none"
                          value={username}
                          onChange={(e) => {
                            setUsername(e.target.value);
                            setFormError("");
                          }}
                          onBlur={() => setTouched((prev) => ({ ...prev, username: true }))}
                          aria-invalid={showUsernameError}
                          aria-describedby={showUsernameError ? "login-username-error" : undefined}
                        >
                          {users.map((u) => (
                            <option key={u.username} value={u.username} className="bg-[var(--card-color)] text-[var(--text-color)]">
                              {u.displayName || u.username}
                            </option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined pointer-events-none absolute right-3 text-[var(--text-secondary-color)]" aria-hidden>expand_more</span>
                      </>
                    ) : (
                      <div className="w-full py-3 text-sm text-[var(--text-secondary-color)]">Sin usuarios disponibles</div>
                    )}
                  </div>
                  {showUsernameError && (
                    <p id="login-username-error" className="mt-1.5 flex items-center gap-1 text-xs text-red-400">
                      <span className="material-symbols-outlined !text-base" aria-hidden>error</span>
                      {errors.username}
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="login-pin" className="block text-xs font-medium text-[var(--text-secondary-color)]">PIN</label>
                    <span className="text-[10px] text-[var(--text-secondary-color)]">4 a 8 dígitos</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-[var(--dark-color)] px-3">
                    <span className="material-symbols-outlined text-[var(--text-secondary-color)]" aria-hidden>key</span>
                    <input
                      id="login-pin"
                      type={showPin ? "text" : "password"}
                      className="w-full bg-transparent py-3 text-sm tracking-[0.2em] outline-none"
                      value={pin}
                      onChange={(e) => {
                        setPin(e.target.value.replace(/\D/g, "").slice(0, 8));
                        setFormError("");
                      }}
                      onBlur={() => setTouched((prev) => ({ ...prev, pin: true }))}
                      placeholder="••••"
                      inputMode="numeric"
                      autoComplete="current-password"
                      aria-invalid={showPinError}
                      aria-describedby={showPinError ? "login-pin-error" : undefined}
                    />
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary-color)] transition hover:bg-white/5 hover:text-[var(--text-color)]"
                      onClick={() => setShowPin((prev) => !prev)}
                      aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                    >
                      <span className="material-symbols-outlined !text-[20px]" aria-hidden>{showPin ? "visibility_off" : "visibility"}</span>
                    </button>
                  </div>
                  {showPinError && (
                    <p id="login-pin-error" className="mt-1.5 flex items-center gap-1 text-xs text-red-400">
                      <span className="material-symbols-outlined !text-base" aria-hidden>error</span>
                      {errors.pin}
                    </p>
                  )}
                </div>

                {(formError || usersError) && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined !text-base pt-0.5" aria-hidden>warning</span>
                      <div className="space-y-2">
                        <p>{formError || usersError}</p>
                        {usersError && (
                          <button
                            type="button"
                            onClick={reloadUsers}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-2.5 py-1.5 text-xs font-medium text-red-100 transition hover:bg-red-400/10"
                          >
                            <span className="material-symbols-outlined !text-sm" aria-hidden>refresh</span>
                            Reintentar carga
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary-color)] px-4 py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={disableSubmit}
                >
                  {loading && <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />}
                  {loading ? "Ingresando..." : "Entrar"}
                </button>
              </form>

              <p className="mt-5 text-xs text-[var(--text-secondary-color)]">
                Si no tienes acceso, solicita alta de usuario al administrador del sistema.
              </p>
            </section>

            <aside className="hidden border-l border-white/10 bg-gradient-to-br from-[var(--primary-color)]/20 via-transparent to-sky-500/10 p-10 lg:flex lg:flex-col lg:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-white/90">
                  <span className="material-symbols-outlined !text-base" aria-hidden>shield</span>
                  Acceso seguro
                </span>
                <h2 className="mt-4 text-3xl font-bold leading-tight">ATM Ricky Rich</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/75">
                  El acceso se realiza con los PIN generados en Odoo. Si no recuerdas tu PIN, contacta al técnico de sistemas.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
