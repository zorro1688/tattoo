const authState = {
  email: "",
  user: null
};

function createAuthModal() {
  const modal = document.createElement("div");
  modal.className = "auth-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <button class="auth-close" type="button" aria-label="Close sign in">×</button>
      <h2 id="authTitle">Sign in to InkFirst</h2>
      <p>Use Google or email to save designs, credits, and download access across devices.</p>
      <button class="google-auth-button" id="authGoogleButton" type="button">Continue with Google</button>
      <div class="auth-divider"><span>or use email</span></div>
      <form id="authEmailForm" class="auth-form">
        <label>
          <span>Email</span>
          <input id="authEmail" type="email" autocomplete="email" required>
        </label>
        <button class="primary-button" type="submit">Send code</button>
      </form>
      <form id="authCodeForm" class="auth-form" hidden>
        <label>
          <span>Verification code</span>
          <input id="authCode" inputmode="numeric" autocomplete="one-time-code" required>
        </label>
        <button class="primary-button" type="submit">Verify and sign in</button>
      </form>
      <p class="auth-status" id="authStatus" role="status" aria-live="polite"></p>
    </div>
  `;
  document.body.append(modal);

  return modal;
}

function authElements() {
  return {
    modal: document.querySelector(".auth-modal") ?? createAuthModal(),
    trigger: document.querySelector("#authButton"),
    menu: document.querySelector("#auth-account-menu"),
    menuEmail: document.querySelector("#authMenuEmail"),
    menuSignOut: document.querySelector("#authMenuSignOut"),
    close: document.querySelector(".auth-close"),
    googleButton: document.querySelector("#authGoogleButton"),
    emailForm: document.querySelector("#authEmailForm"),
    codeForm: document.querySelector("#authCodeForm"),
    emailInput: document.querySelector("#authEmail"),
    codeInput: document.querySelector("#authCode"),
    status: document.querySelector("#authStatus")
  };
}

function ensureAuthButton() {
  const topbar = document.querySelector(".topbar");

  if (!topbar) {
    return;
  }

  let actions = topbar.querySelector(".topbar-actions");
  const navCta = topbar.querySelector(".nav-cta");

  if (!actions) {
    actions = document.createElement("div");
    actions.className = "topbar-actions";
    topbar.append(actions);
  }

  if (navCta && navCta.parentElement !== actions) {
    actions.append(navCta);
  }

  if (document.querySelector("#authButton")) {
    return;
  }

  const button = document.createElement("button");
  button.id = "authButton";
  button.className = "auth-button";
  button.type = "button";
  button.textContent = "Sign in";
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  actions.append(button);

  const menu = document.createElement("div");
  menu.id = "auth-account-menu";
  menu.className = "auth-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  menu.innerHTML = `
    <p class="auth-menu-label">Signed in</p>
    <p class="auth-menu-email" id="authMenuEmail"></p>
    <a href="/my-designs" role="menuitem">My Designs</a>
    <a href="/billing" role="menuitem">Billing & Download access</a>
    <button type="button" id="authMenuSignOut" role="menuitem">Sign out</button>
  `;
  actions.append(menu);
}

function setStatus(message) {
  const status = document.querySelector("#authStatus");
  if (status) {
    status.textContent = message;
  }
}

function openAuthModal() {
  const { modal, emailInput } = authElements();
  modal.hidden = false;
  emailInput?.focus();
}

function openAuthModalWithMessage(message = "") {
  openAuthModal();

  if (message) {
    setStatus(message);
  }
}

function closeAuthModal() {
  const { modal } = authElements();
  modal.hidden = true;
}

function announceAuthState(data) {
  window.dispatchEvent(
    new CustomEvent("inkfirst:auth-state-changed", {
      detail: {
        authenticated: Boolean(data.authenticated),
        user: data.user ?? null
      }
    })
  );
}

function updateAccountNotes(data) {
  const message = data.authenticated && data.user?.email
    ? `Signed in as ${data.user.email}. Your designs and download access are saved to this account.`
    : "Sign in to keep designs across devices.";

  document.querySelectorAll("[data-auth-account-note]").forEach((element) => {
    element.textContent = message;
  });
}

function closeAuthMenu() {
  const { trigger, menu } = authElements();

  if (!menu) {
    return;
  }

  menu.hidden = true;
  trigger?.setAttribute("aria-expanded", "false");
}

function toggleAuthMenu() {
  const { trigger, menu } = authElements();

  if (!menu) {
    return;
  }

  const nextOpen = menu.hidden;
  menu.hidden = !nextOpen;
  trigger?.setAttribute("aria-expanded", String(nextOpen));
}

async function loadAuthSession() {
  const response = await fetch("/api/auth/session");
  const data = await response.json();
  const { trigger: button, menuEmail } = authElements();

  authState.user = data.user ?? null;
  updateAccountNotes(data);

  if (!button) {
    return;
  }

  if (data.authenticated && data.user?.email) {
    button.textContent = "Account";
    button.classList.add("signed-in");
    if (menuEmail) {
      menuEmail.textContent = data.user.email;
    }
  } else {
    button.textContent = "Sign in";
    button.classList.remove("signed-in");
    if (menuEmail) {
      menuEmail.textContent = "";
    }
    closeAuthMenu();
  }

  announceAuthState(data);
}

function startGoogleSignIn() {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
}
async function requestCode(event) {
  event.preventDefault();
  const { emailInput, codeForm, status } = authElements();
  authState.email = emailInput.value.trim();
  status.textContent = "Sending code...";

  try {
    const response = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authState.email })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Could not send code.");
    }

    authState.email = data.email;
    codeForm.hidden = false;
    status.textContent = "Check your email for the verification code.";
  } catch (error) {
    status.textContent = error.message ?? "Could not send code.";
  }
}

async function verifyCode(event) {
  event.preventDefault();
  const { codeInput, status } = authElements();
  status.textContent = "Verifying code...";

  try {
    const response = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: authState.email,
        token: codeInput.value.trim()
      })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Could not verify code.");
    }

    status.textContent = "Signed in.";
    closeAuthModal();
    await loadAuthSession();
  } catch (error) {
    status.textContent = error.message ?? "Could not verify code.";
  }
}

async function signOut() {
  await fetch("/api/auth/sign-out", { method: "POST" });
  window.location.reload();
}

function bindAuthUi() {
  ensureAuthButton();
  createAuthModal();
  const { trigger, close, googleButton, emailForm, codeForm, modal, menuSignOut } = authElements();

  trigger?.addEventListener("click", () => {
    if (authState.user) {
      toggleAuthMenu();
    } else {
      openAuthModal();
    }
  });
  menuSignOut?.addEventListener("click", signOut);
  googleButton?.addEventListener("click", startGoogleSignIn);
  close?.addEventListener("click", closeAuthModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeAuthModal();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".topbar-actions")) {
      closeAuthMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAuthMenu();
      closeAuthModal();
    }
  });
  emailForm?.addEventListener("submit", requestCode);
  codeForm?.addEventListener("submit", verifyCode);
  loadAuthSession().catch(() => {
    setStatus("Sign in is not available right now.");
  });
}

bindAuthUi();

window.InkFirstAuth = {
  open: openAuthModalWithMessage,
  currentUser: () => authState.user
};
