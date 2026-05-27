import { ReferralInvite } from "@/components/auth/referral-invite";

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <ReferralInvite username={username} />;
}
