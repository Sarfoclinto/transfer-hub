"use client";

import { QRCodeSVG } from "qrcode.react";

// Background is deliberately always white, not theme-aware -- QR scanners
// rely on high contrast between the code and its background, and dark
// mode would invert that in a way that can make some scanners struggle.
export function QrCode({
  value,
  size = 160,
}: {
  value: string;
  size?: number;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-white p-3">
      <QRCodeSVG value={value} size={size} level="M" />
    </div>
  );
}
