// QR code generation for Convex functions
// Note: Actual QR generation happens on the client side via qrcode library
// This module provides utilities for building product deep links

/**
 * Build a deep link URL for a product.
 */
export function buildProductDeepLink(
  siteUrl: string,
  productId: string,
): string {
  return `${siteUrl}/products/${productId}`;
}

/**
 * Generate a product QR code identifier.
 * This is stored on the product and used by the client to render the QR.
 */
export function generateProductQRIdentifier(
  productId: string,
  businessId: string,
): string {
  // This creates a unique identifier for the product QR
  // The actual QR rendering is done client-side
  return `${businessId}:${productId}`;
}
