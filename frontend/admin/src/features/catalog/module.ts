import { page, type FeatureModule } from "@/app/moduleTypes"

export const catalogModule: FeatureModule = {
  routes: [
    { path: "products", lazy: page(() => import("./components/Products")) },
    { path: "product_detail/:id", lazy: page(() => import("./components/ProductDetail")) },
    { path: "product_form/:id", lazy: page(() => import("./components/ProductForm")) },
    { path: "bundles", lazy: page(() => import("./components/Bundles")) },
    { path: "bundles/:id", lazy: page(() => import("./components/BundleForm")) },
    { path: "categories", lazy: page(() => import("./components/Categories")) },
    { path: "category_form/:id", lazy: page(() => import("./components/CategoryForm")) },
    { path: "brands", lazy: page(() => import("./components/Brands")) },
    { path: "attributes", lazy: page(() => import("./components/Attributes")) },
    { path: "reviews", lazy: page(() => import("./components/Reviews")) },
    { path: "questions", lazy: page(() => import("./components/Questions")) },
    { path: "price_reports", lazy: page(() => import("./components/PriceReports")) },
  ],
}
