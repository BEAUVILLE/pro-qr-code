// guard.js — DIGIY QR FACTORY / PRO QR CODE
// Accès slug-first, vrai module-first, redirection vers commencer-a-payer si accès absent.
(() => {
  "use strict";

  const SUPABASE_URL =
    window.DIGIY_SUPABASE_URL ||
    "https://wesqmwjjtsefyjnluosj.supabase.co";

  const SUPABASE_ANON_KEY =
    window.DIGIY_SUPABASE_ANON_KEY ||
    window.DIGIY_SUPABASE_ANON ||
    "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3";

  const GUARD_MODULE = "QR_PRO";
  const PAY_URL = "https://commencer-a-payer.digiylyfe.com/";

  const SESSION_KEY = `DIGIY_SESSION_${GUARD_MODULE}`;
  const ACCESS_KEY = "DIGIY_ACCESS";

  const qs = new URLSearchParams(location.search);

  const slugQ = qs.get("slug") || "";
  const phoneQ = qs.get("phone") || qs.get("tel") || "";
  const sourceModuleQ = qs.get("source_module") || qs.get("module") || "";

  const state = {
    module: GUARD_MODULE,
    source_module: "",
    slug: "",
    phone: "",
    access_ok: false,
    reason: "booting"
  };

  function normPhone(value) {
    const d = String(value || "").replace(/[^\d]/g, "");
    return d.length >= 6 ? d : "";
  }

  function normSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function normModule(value) {
    const raw = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "");

    if (raw === "CAISSE") return "POS";
    return raw;
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (_) {
      return null;
    }
  }

  function writeJson(key, payload) {
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (_) {}
  }

  function showPage() {
    try {
      document.documentElement.style.visibility = "";
    } catch (_) {}
  }

  function setState(patch) {
    Object.assign(state, patch || {});
    window.DIGIY_GUARD = api;
  }

  async function rpc(name, params) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(params || {})
    });

    const data = await response.json().catch(() => null);

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  }

  async function resolveBridgeFromSlug(slug) {
    const cleanSlug = normSlug(slug);

    if (!cleanSlug) {
      return {
        phone: "",
        slug: "",
        module: ""
      };
    }

    const url =
      `${SUPABASE_URL}/rest/v1/digiy_subscriptions_public` +
      `?select=phone,slug,module&slug=eq.${encodeURIComponent(cleanSlug)}&limit=1`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: "application/json"
      }
    });

    const data = await response.json().catch(() => []);

    if (!response.ok || !Array.isArray(data) || !data[0]) {
      return {
        phone: "",
        slug: cleanSlug,
        module: ""
      };
    }

    return {
      phone: normPhone(data[0].phone),
      slug: normSlug(data[0].slug || cleanSlug),
      module: normModule(data[0].module)
    };
  }

  function buildPayUrl({ phone, slug, module }) {
    const url = new URL(PAY_URL);

    const cleanPhone = normPhone(phone);
    const cleanSlug = normSlug(slug);
    const cleanModule = normModule(module);

    if (cleanModule) url.searchParams.set("module", cleanModule);
    if (cleanPhone) url.searchParams.set("phone", cleanPhone);
    if (cleanSlug) url.searchParams.set("slug", cleanSlug);

    url.searchParams.set("return", location.href);

    return url.toString();
  }

  function goPay(payload) {
    location.replace(buildPayUrl(payload || {}));
  }

  function rememberSession({ phone, slug, source_module }) {
    const payload = {
      module: GUARD_MODULE,
      source_module: normModule(source_module),
      phone: normPhone(phone),
      slug: normSlug(slug),
      access_ok: true,
      ts: Date.now()
    };

    writeJson(SESSION_KEY, payload);
    writeJson(ACCESS_KEY, {
      phone: payload.phone,
      slug: payload.slug,
      source_module: payload.source_module,
      access_ok: true,
      ts: payload.ts
    });

    try {
      localStorage.setItem("digiy_qr_pro_slug", payload.slug);
      localStorage.setItem("digiy_qr_pro_phone", payload.phone);
      localStorage.setItem("digiy_qr_pro_source_module", payload.source_module);
    } catch (_) {}

    return payload;
  }

  async function hasAccess(phone, module) {
    const cleanPhone = normPhone(phone);
    const cleanModule = normModule(module);

    if (!cleanPhone || !cleanModule) return false;

    const attempts = [
      {
        p_phone: cleanPhone,
        p_module: cleanModule
      },
      {
        phone: cleanPhone,
        module: cleanModule
      }
    ];

    for (const params of attempts) {
      const result = await rpc("digiy_has_access", params);

      if (!result.ok) continue;
      if (result.data === true) return true;
      if (result.data?.ok === true) return true;
      if (result.data?.access === true) return true;
      if (result.data?.access_ok === true) return true;
    }

    return false;
  }

  function getInitialContext() {
    const session = readJson(SESSION_KEY) || {};
    const access = readJson(ACCESS_KEY) || {};

    return {
      slug: normSlug(slugQ || session.slug || access.slug || ""),
      phone: normPhone(phoneQ || session.phone || access.phone || ""),
      source_module: normModule(
        sourceModuleQ ||
        session.source_module ||
        access.source_module ||
        ""
      )
    };
  }

  async function boot() {
    try {
      let { slug, phone, source_module } = getInitialContext();

      if (slug) {
        const bridge = await resolveBridgeFromSlug(slug);

        if (bridge.slug) slug = bridge.slug;
        if (!phone && bridge.phone) phone = bridge.phone;
        if (!source_module && bridge.module) source_module = bridge.module;
      }

      if (!slug && !phone) {
        setState({
          access_ok: false,
          reason: "missing_identity",
          slug: "",
          phone: "",
          source_module
        });

        showPage();
        goPay({ phone: "", slug: "", module: source_module });
        return state;
      }

      if (!source_module) {
        setState({
          access_ok: false,
          reason: "missing_source_module",
          slug,
          phone,
          source_module: ""
        });

        showPage();
        goPay({ phone, slug, module: "" });
        return state;
      }

      if (!phone) {
        setState({
          access_ok: false,
          reason: "missing_phone",
          slug,
          phone: "",
          source_module
        });

        showPage();
        goPay({ phone: "", slug, module: source_module });
        return state;
      }

      const ok = await hasAccess(phone, source_module);

      if (ok) {
        rememberSession({
          phone,
          slug,
          source_module
        });

        setState({
          access_ok: true,
          reason: "access_ok",
          slug,
          phone,
          source_module
        });

        showPage();
        return state;
      }

      setState({
        access_ok: false,
        reason: "no_access",
        slug,
        phone,
        source_module
      });

      showPage();
      goPay({ phone, slug, module: source_module });
      return state;
    } catch (error) {
      console.error("[DIGIY QR PRO GUARD] error:", error);

      const fallback = getInitialContext();

      setState({
        access_ok: false,
        reason: "guard_error",
        slug: fallback.slug,
        phone: fallback.phone,
        source_module: fallback.source_module
      });

      showPage();

      goPay({
        phone: fallback.phone,
        slug: fallback.slug,
        module: fallback.source_module
      });

      return state;
    }
  }

  let readyPromise = null;

  function ready() {
    if (!readyPromise) readyPromise = boot();
    return readyPromise;
  }

  const api = {
    state,
    ready,
    getSession: () => ({
      module: GUARD_MODULE,
      source_module: state.source_module || "",
      slug: state.slug || "",
      phone: state.phone || "",
      access_ok: !!state.access_ok,
      reason: state.reason || ""
    }),
    getSlug: () => state.slug || "",
    getPhone: () => state.phone || "",
    getSourceModule: () => state.source_module || "",
    buildPayUrl,
    goPay
  };

  window.DIGIY_GUARD = api;

  ready();
})();
