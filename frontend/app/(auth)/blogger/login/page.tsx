import { Suspense } from "react";
import { BloggerLoginScreen } from "@/components/auth/blogger-login-screen";

export default function BloggerLoginPage() {
  return (
    <Suspense fallback={null}>
      <BloggerLoginScreen />
    </Suspense>
  );
}
