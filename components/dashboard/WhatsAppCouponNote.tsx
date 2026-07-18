/* A sticky-note nudge telling users how to get credits: message the coupon
 * WhatsApp number, receive a code, and redeem it in the token window. Reuses the
 * slide presentation's sticky-note look (.comp-sticky.sticky-green) so it matches
 * the rest of the app. */

const WHATSAPP_NUMBER = '+584120300297';
const WA_LINK = 'https://wa.me/584120300297?text=' + encodeURIComponent("Hi! I'd like a SketchLearn credit coupon.");

// The WhatsApp glyph as an inline SVG (self-contained, no external asset).
function WhatsAppLogo({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ flex: '0 0 auto' }}>
      <path fill="#25D366" d="M16 0a16 16 0 0 0-13.79 24.04L0 32l8.2-2.15A16 16 0 1 0 16 0z" />
      <path fill="#fff" d="M12.08 8.62c-.28-.62-.5-.63-.77-.64h-.66c-.23 0-.6.09-.92.43-.31.34-1.2 1.17-1.2 2.85s1.23 3.31 1.4 3.54c.17.23 2.37 3.8 5.86 5.18 2.9 1.14 3.49.92 4.12.86.63-.06 2.04-.83 2.33-1.64.29-.8.29-1.5.2-1.64-.08-.14-.31-.23-.65-.4-.34-.17-2.04-1.01-2.36-1.12-.31-.11-.54-.17-.77.17-.23.34-.88 1.12-1.08 1.35-.2.23-.4.26-.74.09-.34-.17-1.45-.53-2.76-1.7-1.02-.91-1.71-2.03-1.91-2.37-.2-.34-.02-.53.15-.7.15-.15.34-.4.51-.6.17-.2.23-.34.34-.57.11-.23.06-.43-.03-.6-.09-.17-.76-1.9-1.06-2.6z" />
    </svg>
  );
}

export function WhatsAppCouponNote() {
  return (
    <div className="slide-comp comp-sticky sticky-green" style={{ transform: 'rotate(-1deg)', marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <WhatsAppLogo />
        <div style={{ minWidth: 0 }}>
          <b className="sticky-title" style={{ display: 'block' }}>Out of credits? Get a coupon on WhatsApp</b>
          <ol style={{ margin: '6px 0 8px', paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
            <li>Message <b>{WHATSAPP_NUMBER}</b> on WhatsApp and ask for a credit coupon.</li>
            <li>You&apos;ll get a code like <code>SKL-XXXX-XXXX</code>.</li>
            <li>Enter it in <b>🎫 Redeem a coupon</b> below to top up your wallet.</li>
          </ol>
          <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="btn small green" style={{ textDecoration: 'none' }}>
            💬 Message us on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
