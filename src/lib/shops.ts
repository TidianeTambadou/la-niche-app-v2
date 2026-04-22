/**
 * Compat shim. Real shop + stock data comes from `@/lib/data` (Supabase).
 */

export { useShops, useShop, useShopStock, generateGuidedRoute, shopOpenNow } from "@/lib/data";
export type { RemoteShop as Shop, RemoteStockItem as StockItem } from "@/lib/data";
