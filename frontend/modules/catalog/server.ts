// Server-only public API of this module (data reads). Import from server components and route handlers only.
export { getCatalog, getProductBySlug, getRelatedProductsBySlug } from "./data/catalog";
export type { Catalog } from "./data/catalog";
