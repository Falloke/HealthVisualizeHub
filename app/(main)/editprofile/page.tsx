import { Suspense } from "react";
import EditProfilePage from "@/app/features/main/editprofilePage/index";

export default function EditProfile() {
  return (
    <Suspense fallback={null}>
      <EditProfilePage />
    </Suspense>
  );
}
