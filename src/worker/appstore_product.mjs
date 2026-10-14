/**
 * 044 F1 — the ONE place the App Store product and app identity are
 * named. The Worker (appstore.mjs) and the iPad app (the generated core
 * exposes PIPCORE.purchase.PRODUCT_ID; the .storekit file and the Swift
 * tests assert the same string) both read it from here.
 *
 * Consumable "Pip Lifetime for one user" (Pricing_And_Packaging § 4.5).
 */
export const PIP_LIFETIME_PRODUCT_ID = "org.pipaac.lifetime.user";
export const PIP_BUNDLE_ID = "org.pipaac";
