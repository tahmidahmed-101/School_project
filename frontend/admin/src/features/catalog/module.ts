import { Boxes } from "lucide-react"
import { page, type FeatureModule } from "@/app/moduleTypes"

export const catalogModule: FeatureModule = {
  routes: [
    { path: "products", lazy: page(() => import("./components/Products")) },
    { path: "product_detail/:id", lazy: page(() => import("./components/ProductDetail")) },
    { path: "product_form/:id", lazy: page(() => import("./components/ProductForm")) },
    { path: "variants", lazy: page(() => import("./components/Variants")) },
    { path: "bundles", lazy: page(() => import("./components/Bundles")) },
    { path: "bundles/:id", lazy: page(() => import("./components/BundleForm")) },
    { path: "categories", lazy: page(() => import("./components/Categories")) },
    { path: "category_form/:id", lazy: page(() => import("./components/CategoryForm")) },
    { path: "brands", lazy: page(() => import("./components/Brands")) },
  ],
  nav: [
    {
      label: "Catalog",
      icon: Boxes,
      group: "MAIN",
      order: 20,
      items: [
        { title: "Products", url: "/products", permission: ["catalog.view", "catalog.manage"] },
        { title: "Variants", url: "/variants", permission: ["catalog.view", "catalog.manage"] },
        { title: "Bundles", url: "/bundles", permission: ["catalog.view", "catalog.manage"] },
        { title: "Categories", url: "/categories", permission: ["catalog.view", "catalog.manage"] },
        { title: "Brands", url: "/brands", permission: ["catalog.view", "catalog.manage"] },
      ],
    },
  ],
}
