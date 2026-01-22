import { Suspense } from "react";
import SearchPage from "@/app/features/main/searchPage";

export default function Search() {
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  );
}
