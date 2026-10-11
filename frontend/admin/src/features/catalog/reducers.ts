import productReducer from "./slices/productSlice"
import categoryReducer from "./slices/categorySlice"
import brandReducer from "./slices/brandSlice"
import bundleReducer from "./slices/bundleSlice"
import reviewReducer from "./slices/reviewSlice"
import questionReducer from "./slices/questionSlice"
import priceReportReducer from "./slices/priceReportSlice"

export const catalogReducers = {
  products: productReducer,
  categories: categoryReducer,
  brands: brandReducer,
  catalogBundles: bundleReducer,
  catalogReviews: reviewReducer,
  catalogQuestions: questionReducer,
  catalogPriceReports: priceReportReducer,
}
