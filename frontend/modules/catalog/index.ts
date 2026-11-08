// Public API of this module: the only file other modules and routes may import from.
export { CatalogProvider, ProductsProvider, useBrand, useCatalog, useProducts } from "./context";
export { CategoryShowcase } from "./ui/CategoryShowcase";
export { MobileSearchBar } from "./ui/MobileSearchBar";
export { NavbarSearch } from "./ui/NavbarSearch";
export { ProductDetailView } from "./ui/ProductDetailView";
export { ProductGrid } from "./ui/ProductGrid";
export { ShopCatalog } from "./ui/ShopCatalog";
export { TrendingSection } from "./ui/TrendingSection";
export { WithActiveCategory } from "./ui/WithActiveCategory";
export { ProductGridSkeleton, ShopSkeleton } from "./ui/CatalogSkeletons";
export { ContactButtons } from "./ui/ContactButtons";
export { categoryGroups, categoryTree, type CategoryGroup, type CategoryNode } from "./domain/category-tree";
export { forListing, moreForProduct, relatedForProduct } from "./domain/listing";
