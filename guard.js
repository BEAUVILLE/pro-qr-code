// guard-pro.js — DIGIY PRO access gate (slug-first, real-module-first) -> commencer-a-payer
(() => {
  "use strict";

  const SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJ9..."; // garde ta vraie clé complète ici

  // ✅ module du moule courant (session locale)
  const GUARD_MODULE = "QR_PRO";

  const PAY_URL = "https://commencer-a-payer.digiylyfe.com/";
  const SESSION_KEY = `DIGIY_SESSION_${GUARD_MODULE}`;
  const ACCESS_KEY = "DIGIY_ACCESS";

  const qs = new URLSearchParams(location.search);
  const slugQ = (qs.get("slug") || "").trim();
  const phoneQ = (qs.get("phone") || "").trim();
  const sourceModuleQ = (qs.get("source_module") || qs.get("module") || "").trim();

  function normPhone(p) {
    const d = String(p || "").replace(/[^\d]/g, "");
    return d.length >= 9 ? d : "";
  }

  function normSlug(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function normModule(m) {
    return String(m || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "");
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  async function rpc(name, params) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const j = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data: j };
  }

  async function resolveBridgeFromSlug(slug) {
    const s = normSlug(slug);
    if (!s) return { phone: "", slug: "", module: "" };

    const url =
      `${SUPABASE_URL}/rest/v1/digiy_subscriptions_public` +
      `?select=phone,slug,module&slug=eq.${encodeURIComponent(s)}&limit=1`;

    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    const arr = await r.json().catch(() => []);
    if (!r.ok || !Array.isArray(arr) || !arr[0]) {
      return { phone: "", slug: s, module: "" };
    }

    return {
      phone: normPhone(arr[0].phone || ""),
      slug: normSlug(arr[0].slug || s),
      module: normModule(arr[0].module || ""),
    };
  }

  function goPay({ phone, slug, module }) {
    const u = new URL(PAY_URL);

    const p = normPhone(phone);
    const s = normSlug(slug);
    const m = normModule(module);

    if (m) u.searchParams.set("module", m);
    if (p) u.searchParams.set("phone", p);
    if (s) u.searchParams.set("slug", s);

    u.searchParams.set("return", location.href);
    location.replace(u.toString());
  }

  async function go() {
    const session = readJson(SESSION_KEY) || {};
    const access = readJson(ACCESS_KEY) || {};

    let slug = normSlug(
      slugQ ||
      session.slug ||
      access.slug ||
      ""
    );

    let phone = normPhone(
      phoneQ ||
      session.phone ||
      access.phone ||
      ""
    );

    let realModule = normModule(
      sourceModuleQ ||
      session.source_module ||
      access.source_module ||
      ""
    );

    // slug-first : si slug présent, on relit la vérité backend
    if (slug) {
      const bridge = await resolveBridgeFromSlug(slug);

      if (!phone && bridge.phone) phone = bridge.phone;
      if (!realModule && bridge.module) realModule = bridge.module;
      if (bridge.slug) slug = bridge.slug;
    }

    // pas de slug ni phone => payer direct
    if (!slug && !phone) {
      return goPay({ phone: "", slug: "", module: realModule });
    }

    // pas de module réel => impossible de vérifier correctement
    if (!realModule) {
      return goPay({ phone, slug, module: "" });
    }

    // pas de phone => on ne peut pas vérifier
    if (!phone) {
      return goPay({ phone: "", slug, module: realModule });
    }

    // check access sur le vrai module, pas sur QR_PRO
    const res = await rpc("digiy_has_access", {
      p_phone: phone,
      p_module: realModule
    });

    // boolean true/false attendu
    if (res.ok && res.data === true) {
      return; // ✅ accès OK
    }

    return goPay({ phone, slug, module: realModule });
  }

  go().catch(() => {
    const session = readJson(SESSION_KEY) || {};
    const access = readJson(ACCESS_KEY) || {};

    goPay({
      phone: phoneQ || session.phone || access.phone || "",
      slug: slugQ || session.slug || access.slug || "",
      module: sourceModuleQ || session.source_module || access.source_module || ""
    });
  });
})();;
