import { Suspense } from "react";
import ProfilePage from "@/app/features/main/profilePage/Index";

export default function ProfilePageRender() {
  return (
    <Suspense fallback={null}>
      <ProfilePage />
    </Suspense>
  );
}
