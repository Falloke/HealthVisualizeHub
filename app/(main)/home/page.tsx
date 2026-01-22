import { Suspense } from "react";
import HomePage from "@/app/features/main/homePage/Index";

export default function HomePageRender() {
  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-10 2xl:px-14 py-4">
      <Suspense fallback={null}>
        <HomePage />
      </Suspense>
    </div>
  );
}
