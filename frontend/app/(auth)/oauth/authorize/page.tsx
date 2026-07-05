import { Suspense } from "react";

import { OAuthAuthorizeScreen } from "@/components/auth/oauth-authorize-screen";

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={null}>
      <OAuthAuthorizeScreen />
    </Suspense>
  );
}
