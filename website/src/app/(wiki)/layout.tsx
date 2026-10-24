import { AuthProvider } from "@/lib/auth/AuthContext";

export default function WikiLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <AuthProvider>{children}</AuthProvider>;
}
