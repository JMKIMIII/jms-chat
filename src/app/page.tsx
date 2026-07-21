import { ChatLayout } from "@/domain/chat/components/ChatLayout";
import { AuthWrapper } from "@/domain/auth/components/AuthWrapper";

export default function Home() {
  return (
    <AuthWrapper>
      <ChatLayout />
    </AuthWrapper>
  );
}
